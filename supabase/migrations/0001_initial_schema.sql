-- Mahjong Score App: Supabase 初期スキーマ
-- Supabase CLI migration または Dashboard の SQL Editor で適用する。

create extension if not exists pgcrypto;

create or replace function public.generate_share_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for index in 1..8 loop
    result := result || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
  end loop;
  return result;
end;
$$;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  share_code text not null unique default public.generate_share_code()
    check (share_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  name text not null check (char_length(trim(name)) > 0),
  players text[] not null check (cardinality(players) = 4),
  uma_rule text not null check (uma_rule in ('5-10', '10-20', '10-30')),
  oka_rule text not null check (oka_rule in ('oka20', 'oka0')),
  tie_rule text not null check (tie_rule in ('split', 'seat')),
  fee_enabled boolean not null default false,
  fee_amount numeric not null default 0 check (fee_amount >= 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  date date not null,
  fee_enabled boolean not null default false,
  fee_amount numeric not null default 0 check (fee_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, room_id)
);

create index sessions_room_date_idx on public.sessions (room_id, date);

create table public.hands (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid not null,
  scores integer[] not null check (cardinality(scores) = 4),
  tie_break_orders jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, room_id) references public.sessions(id, room_id) on delete cascade
);

create index hands_room_created_at_idx on public.hands (room_id, created_at);
create index hands_session_created_at_idx on public.hands (session_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create or replace function public.prevent_room_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'room owner cannot be changed';
  end if;
  return new;
end;
$$;

create trigger rooms_prevent_owner_change
before update on public.rooms
for each row execute function public.prevent_room_owner_change();

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

create trigger hands_set_updated_at
before update on public.hands
for each row execute function public.set_updated_at();

create or replace function public.add_room_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.room_members (room_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger rooms_add_owner
after insert on public.rooms
for each row execute function public.add_room_owner();

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_room_owner(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- 共有コードを知る利用者だけをRoomメンバーに加える。コード自体は読み出さない。
create or replace function public.join_room_by_share_code(input_share_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select id into target_room_id
  from public.rooms
  where share_code = upper(trim(input_share_code));

  if target_room_id is null then
    raise exception 'room not found';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (target_room_id, auth.uid(), 'member')
  on conflict (room_id, user_id) do nothing;

  return target_room_id;
end;
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.hands enable row level security;

create policy "members can read rooms"
on public.rooms for select
using (public.is_room_member(id));

create policy "users can create owned rooms"
on public.rooms for insert
with check (owner_id = auth.uid());

create policy "members can update rooms"
on public.rooms for update
using (public.is_room_member(id))
with check (public.is_room_member(id));

create policy "owners can delete rooms"
on public.rooms for delete
using (public.is_room_owner(id));

create policy "members can read memberships"
on public.room_members for select
using (public.is_room_member(room_id));

create policy "members can read sessions"
on public.sessions for select
using (public.is_room_member(room_id));

create policy "members can create sessions"
on public.sessions for insert
with check (public.is_room_member(room_id));

create policy "members can update sessions"
on public.sessions for update
using (public.is_room_member(room_id))
with check (public.is_room_member(room_id));

create policy "members can delete sessions"
on public.sessions for delete
using (public.is_room_member(room_id));

create policy "members can read hands"
on public.hands for select
using (public.is_room_member(room_id));

create policy "members can create hands"
on public.hands for insert
with check (public.is_room_member(room_id));

create policy "members can update hands"
on public.hands for update
using (public.is_room_member(room_id))
with check (public.is_room_member(room_id));

create policy "members can delete hands"
on public.hands for delete
using (public.is_room_member(room_id));

-- 「Automatically expose new tables」を無効にした場合でも、
-- 匿名ログイン後の authenticated ロールから必要なテーブルだけを利用できるようにする。
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.rooms to authenticated;
grant select on table public.room_members to authenticated;
grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert, update, delete on table public.hands to authenticated;

revoke all on function public.join_room_by_share_code(text) from public;
grant execute on function public.join_room_by_share_code(text) to authenticated;
