-- ルーム・対局日・半荘を一つのスナップショットとして保存する。
-- revision を条件に更新するため、別端末の更新を意図せず上書きしない。

create or replace function public.save_room_snapshot(
  p_room jsonb,
  p_sessions jsonb,
  p_hands jsonb,
  p_base_revision bigint
)
returns table (room_id uuid, share_code text, revision bigint, updated_at bigint)
language plpgsql
security definer
set search_path = public
set lock_timeout = '10s'
set statement_timeout = '20s'
as $$
declare
  target_room public.rooms%rowtype;
  requested_room_id uuid := (p_room ->> 'id')::uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target_room
  from public.rooms
  where id = requested_room_id
  for update;

  if not found then
    -- GAS同期済みの既存ルームはローカルにリビジョンを持つが、
    -- Supabase側に未登録なら初回移行として作成する。
    insert into public.rooms (
      id, owner_id, name, players, uma_rule, oka_rule, tie_rule, fee_enabled, fee_amount
    )
    values (
      requested_room_id,
      auth.uid(),
      trim(p_room ->> 'name'),
      array(select jsonb_array_elements_text(p_room -> 'players')),
      p_room ->> 'umaRule',
      p_room ->> 'okaRule',
      p_room ->> 'tieRule',
      coalesce((p_room ->> 'feeEnabled')::boolean, false),
      coalesce((p_room ->> 'feeAmount')::numeric, 0)
    )
    returning * into target_room;
  else
    if not public.is_room_member(requested_room_id) then
      raise exception 'room access denied' using errcode = '42501';
    end if;
    if target_room.revision <> p_base_revision then
      raise exception 'room conflict' using errcode = 'P0001';
    end if;

    update public.rooms
    set
      name = trim(p_room ->> 'name'),
      players = array(select jsonb_array_elements_text(p_room -> 'players')),
      uma_rule = p_room ->> 'umaRule',
      oka_rule = p_room ->> 'okaRule',
      tie_rule = p_room ->> 'tieRule',
      fee_enabled = coalesce((p_room ->> 'feeEnabled')::boolean, false),
      fee_amount = coalesce((p_room ->> 'feeAmount')::numeric, 0),
      revision = target_room.revision + 1
    where id = requested_room_id
    returning * into target_room;
  end if;

  delete from public.hands as target_hands where target_hands.room_id = requested_room_id;
  delete from public.sessions as target_sessions where target_sessions.room_id = requested_room_id;

  insert into public.sessions (id, room_id, date, fee_enabled, fee_amount, created_at, updated_at)
  select
    (item ->> 'id')::uuid,
    requested_room_id,
    (item ->> 'date')::date,
    coalesce((item ->> 'feeEnabled')::boolean, false),
    coalesce((item ->> 'feeAmount')::numeric, 0),
    to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from now()) * 1000) / 1000),
    to_timestamp(coalesce((item ->> 'updatedAt')::double precision, extract(epoch from now()) * 1000) / 1000)
  from jsonb_array_elements(p_sessions) as entries(item);

  insert into public.hands (id, room_id, session_id, scores, tie_break_orders, created_at, updated_at)
  select
    (item ->> 'id')::uuid,
    requested_room_id,
    (item ->> 'sessionId')::uuid,
    array(select value::integer from jsonb_array_elements_text(item -> 'scores')),
    item -> 'tieBreakOrders',
    to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from now()) * 1000) / 1000),
    to_timestamp(coalesce((item ->> 'updatedAt')::double precision, extract(epoch from now()) * 1000) / 1000)
  from jsonb_array_elements(p_hands) as entries(item);

  return query
  select
    target_room.id,
    target_room.share_code,
    target_room.revision,
    (extract(epoch from target_room.updated_at) * 1000)::bigint;
end;
$$;

revoke all on function public.save_room_snapshot(jsonb, jsonb, jsonb, bigint) from public;
grant execute on function public.save_room_snapshot(jsonb, jsonb, jsonb, bigint) to authenticated;
