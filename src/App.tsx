import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type HandRecord,
  type OkaRuleId,
  type Room,
  type Session,
  type SyncState,
  type TieBreakOrder,
  type TieRuleId,
  type UmaRuleId,
} from "./db";
import { BACKUP_FORMAT_VERSION, parseBackup, type BackupData } from "./backup";
import { getRemoteRoom, getRemoteRoomByShareCode, saveRemoteRoom, type RoomSyncPayload } from "./sync";
import {
  computeHandPoints,
  getTieGroups,
  getOkaRule,
  getUmaRule,
  hasSelectedTieOrder,
  resolveTieOrder,
  type TieGroup,
} from "./domain/scoring";
import { createSessionSummary } from "./domain/analytics";
import { BackupPanel } from "./components/BackupPanel";
import { RoomList } from "./components/RoomList";
import { RoomForm } from "./components/RoomForm";
import { RoomAddPanel } from "./components/RoomAddPanel";
import { SessionPanel } from "./components/SessionPanel";
import { HandTable } from "./components/HandTable";
import { SyncPanel } from "./components/SyncPanel";
import "./App.css";

const defaultPlayers: [string, string, string, string] = ["A", "B", "C", "D"];
const defaultScoreInputs: [string, string, string, string] = ["", "", "", ""];
type TieRankSelection = { score: number; playerRanks: Record<number, number> };
const todayString = () => new Date().toISOString().slice(0, 10);
const backupTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};
const filenameSafe = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "_").trim() || "ルーム";
const makeId = () =>
  crypto.randomUUID?.() ??
  `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
/** 点数入力では末尾の 00 を省略し、250 を 25,000 点として扱う。 */
const parseScore = (value: string) =>
  /^-?\d+$/.test(value.trim()) ? Number.parseInt(value, 10) * 100 : null;
const formatScoreInput = (score: number) => String(score / 100);
const parsePositiveInt = (value: string) =>
  /^[1-9]\d*$/.test(value.trim()) ? Number.parseInt(value, 10) : null;
const formatAmount = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
type PointSeries = { date: string; totals: number[] };
const PointTrendChart = ({
  series,
  players,
  highlightedPlayerIndex,
  label,
}: {
  series: PointSeries[];
  players: string[];
  highlightedPlayerIndex: number | null;
  label: string;
}) => {
  const values = series.flatMap((item) => item.totals);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const colors = ["#0f5132", "#b54708", "#2764a8", "#8a3fa0"];
  return (
    <>
      <div className="chart-legend">
        {players.map((player, index) => (
          <span
            key={player}
            style={{
              opacity:
                highlightedPlayerIndex === null ||
                highlightedPlayerIndex === index
                  ? 1
                  : 0.25,
            }}
          >
            <i style={{ backgroundColor: colors[index] }} />
            {player}
          </span>
        ))}
      </div>
      <div className="chart-wrap">
        <svg
          className="revenue-chart"
          viewBox="0 0 640 280"
          role="img"
          aria-label={label}
        >
          <line x1="52" y1="18" x2="52" y2="236" className="chart-axis" />
          <line x1="52" y1="236" x2="620" y2="236" className="chart-axis" />
          <line
            x1="52"
            y1={18 + (max / range) * 218}
            x2="620"
            y2={18 + (max / range) * 218}
            className="chart-zero"
          />
          <text x="4" y="24" className="chart-label">
            {max.toFixed(1)}pt
          </text>
          <text x="4" y="236" className="chart-label">
            {min.toFixed(1)}pt
          </text>
          {players.map((player, playerIndex) => {
            const points = series
              .map(
                (item, index) =>
                  `${series.length === 1 ? 336 : 52 + (index / (series.length - 1)) * 568},${18 + ((max - item.totals[playerIndex]) / range) * 218}`,
              )
              .join(" ");
            return (
              <g
                key={player}
                opacity={
                  highlightedPlayerIndex === null ||
                  highlightedPlayerIndex === playerIndex
                    ? 1
                    : 0.15
                }
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke={colors[playerIndex]}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {series.map((item, index) => {
                  const x =
                    series.length === 1
                      ? 336
                      : 52 + (index / (series.length - 1)) * 568;
                  const y =
                    18 + ((max - item.totals[playerIndex]) / range) * 218;
                  return (
                    <circle
                      key={item.date}
                      cx={x}
                      cy={y}
                      r="4"
                      fill={colors[playerIndex]}
                    >
                      <title>{`${item.date}: ${player} ${item.totals[playerIndex].toFixed(1)}pt`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
          <text x="52" y="264" className="chart-label">
            {series[0].date}
          </text>
          {series.length > 1 && (
            <text x="620" y="264" textAnchor="end" className="chart-label">
              {series[series.length - 1].date}
            </text>
          )}
        </svg>
      </div>
    </>
  );
};
function App() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [roomName, setRoomName] = useState("");
  const [roomPlayers, setRoomPlayers] = useState(defaultPlayers);
  const [roomUma, setRoomUma] = useState<UmaRuleId>("10-20");
  const [roomOka, setRoomOka] = useState<OkaRuleId>("oka20");
  const [roomTie, setRoomTie] = useState<TieRuleId>("split");
  const [isRoomCreateOpen, setIsRoomCreateOpen] = useState(false);
  const [isRoomJoinOpen, setIsRoomJoinOpen] = useState(false);
  const [shareCodeInput, setShareCodeInput] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [newSessionDate, setNewSessionDate] = useState(todayString);
  const [newSessionFeeEnabled, setNewSessionFeeEnabled] = useState(false);
  const [newSessionFeeAmount, setNewSessionFeeAmount] = useState("");
  const [editingHandId, setEditingHandId] = useState<string | null>(null);
  const [editingHandCreatedAt, setEditingHandCreatedAt] = useState<
    number | null
  >(null);
  const [scoreInputs, setScoreInputs] = useState(defaultScoreInputs);
  const [tieBreakOrders, setTieBreakOrders] = useState<TieBreakOrder[]>([]);
  const [tieRankSelections, setTieRankSelections] = useState<TieRankSelection[]>([]);
  const [tieBreakMessage, setTieBreakMessage] = useState("");
  const [showTotalFees, setShowTotalFees] = useState(false);
  const [analysisStartSessionId, setAnalysisStartSessionId] = useState("");
  const [analysisEndSessionId, setAnalysisEndSessionId] = useState("");
  const [highlightedPlayerIndex, setHighlightedPlayerIndex] = useState<
    number | null
  >(null);
  const [exportMessage, setExportMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (!isRoomCreateOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsRoomCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRoomCreateOpen]);

  const rooms = useLiveQuery(
    () => db.rooms.orderBy("createdAt").reverse().toArray(),
    [],
    [] as Room[],
  );
  const route = hash.match(/^#\/room\/([^/]+)(\/analysis)?$/);
  const routeRoomId = route?.[1] ? decodeURIComponent(route[1]) : null;
  const activeRoomId = routeRoomId ?? selectedRoomId ?? rooms[0]?.id ?? null;
  const isHomeView = !route;
  const isRoomView = Boolean(route);
  const isAnalysisView = Boolean(route?.[2]);
  const allSessions = useLiveQuery(
    () => db.sessions.toArray(),
    [],
    [] as Session[],
  );
  const sessions = useLiveQuery(
    () =>
      activeRoomId
        ? db.sessions.where("roomId").equals(activeRoomId).sortBy("date")
        : Promise.resolve([] as Session[]),
    [activeRoomId],
    [] as Session[],
  );
  const roomHands = useLiveQuery(
    () =>
      activeRoomId
        ? db.hands.where("roomId").equals(activeRoomId).sortBy("createdAt")
        : Promise.resolve([] as HandRecord[]),
    [activeRoomId],
    [] as HandRecord[],
  );
  const syncState = useLiveQuery(
    () => (activeRoomId ? db.syncStates.get(activeRoomId) : undefined),
    [activeRoomId],
    undefined as SyncState | undefined,
  );
  const activeSessionId =
    selectedSessionId &&
    sessions.some((session) => session.id === selectedSessionId)
      ? selectedSessionId
      : (sessions.at(-1)?.id ?? null);
  const selectedRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const selectedSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;
  const hands = activeSessionId
    ? roomHands.filter((hand) => hand.sessionId === activeSessionId)
    : [];
  const activeHighlightedPlayerIndex =
    selectedRoom &&
    highlightedPlayerIndex !== null &&
    highlightedPlayerIndex < selectedRoom.players.length
      ? highlightedPlayerIndex
      : null;

  const parsedScores = scoreInputs.map(parseScore);
  const scoreReady = parsedScores.every((score) => score !== null);
  const scoreTotal = scoreReady ? sum(parsedScores as number[]) : null;
  const scoreOk = scoreTotal === 100000;
  const tieGroups = scoreReady ? getTieGroups(parsedScores as number[]) : [];
  const requiresTieBreakSelection =
    selectedRoom?.tieRule === "seat" &&
    tieGroups.some((group) => !hasSelectedTieOrder(group, tieBreakOrders));
  const handPreview =
    selectedRoom && scoreReady && !requiresTieBreakSelection
      ? computeHandPoints(
          selectedRoom,
          parsedScores as number[],
          tieBreakOrders,
        )
      : null;
  const summaries = selectedRoom
    ? sessions.map((session) =>
        createSessionSummary(
          selectedRoom,
          session,
          roomHands.filter((hand) => hand.sessionId === session.id),
        ),
      )
    : [];
  const selectedSummary = summaries.find(
    (summary) => summary.session.id === activeSessionId,
  );
  const analysisStartDate = sessions.find(
    (session) => session.id === analysisStartSessionId,
  )?.date;
  const analysisEndDate = sessions.find(
    (session) => session.id === analysisEndSessionId,
  )?.date;
  const hasInvalidAnalysisRange =
    Boolean(analysisStartDate && analysisEndDate) &&
    analysisStartDate! > analysisEndDate!;
  const analysisSummaries = hasInvalidAnalysisRange
    ? []
    : summaries.filter(
        (summary) =>
          (!analysisStartDate || summary.session.date >= analysisStartDate) &&
          (!analysisEndDate || summary.session.date <= analysisEndDate),
      );
  const analysisHands = analysisSummaries.flatMap((summary) => summary.hands);
  const playerStats = !selectedRoom
    ? []
    : selectedRoom.players.map((player, index) => {
        const handResults = analysisHands.map((hand) =>
          computeHandPoints(selectedRoom, hand.scores, hand.tieBreakOrders),
        );
        const ranks = handResults.map((result) => result.ranks[index]);
        const totalPoints = sum(
          analysisSummaries.map((summary) => summary.totals[index]),
        );
        const finalScores = analysisHands.map((hand) => hand.scores[index]);
        const sessionCount = analysisSummaries.filter(
          (summary) => summary.hands.length > 0,
        ).length;
        return {
          player,
          totalPoints,
          averagePoints: sessionCount ? totalPoints / sessionCount : 0,
          sessionCount,
          averageRank: ranks.length ? sum(ranks) / ranks.length : 0,
          ranks,
          finalScores,
          fee: sum(analysisSummaries.map((summary) => summary.feeShares[index])),
        };
      });
  const newSessionFeeValue = parsePositiveInt(newSessionFeeAmount);
  const roomCanSave =
    roomName.trim().length > 0 && roomPlayers.every((player) => player.trim());
  const hasSessionFees = analysisSummaries.some(
    (summary) => summary.session.feeEnabled,
  );
  const dailyPointSeries = analysisSummaries
    .filter((summary) => summary.hands.length > 0)
    .map((summary) => ({ date: summary.session.date, totals: summary.totals }));
  const totalPointSeries = dailyPointSeries.reduce<PointSeries[]>(
    (series, item) => [
      ...series,
      {
        date: item.date,
        totals: item.totals.map(
          (total, index) => total + (series.at(-1)?.totals[index] ?? 0),
        ),
      },
    ],
    [],
  );

  const resetRoomForm = () => {
    setRoomName("");
    setRoomPlayers(defaultPlayers);
    setRoomUma("10-20");
    setRoomOka("oka20");
    setRoomTie("split");
  };
  const resetHandForm = () => {
    setEditingHandId(null);
    setEditingHandCreatedAt(null);
    setScoreInputs(defaultScoreInputs);
    setTieBreakOrders([]);
    setTieRankSelections([]);
    setTieBreakMessage("");
  };
  const saveRoom = async () => {
    if (!roomCanSave) return;
    const now = Date.now();
    const room: Room = {
      id: makeId(),
      name: roomName.trim(),
      players: roomPlayers,
      umaRule: roomUma,
      okaRule: roomOka,
      tieRule: roomTie,
      createdAt: now,
      updatedAt: now,
    };
    await db.rooms.add(room);
    setSelectedRoomId(room.id);
    resetRoomForm();
    setIsRoomCreateOpen(false);
    window.location.hash = `/room/${encodeURIComponent(room.id)}`;
  };
  const addSession = async () => {
    if (
      !activeRoomId ||
      !newSessionDate ||
      (newSessionFeeEnabled && newSessionFeeValue === null)
    )
      return;
    const now = Date.now();
    const session: Session = {
      id: makeId(),
      roomId: activeRoomId,
      date: newSessionDate,
      feeEnabled: newSessionFeeEnabled,
      feeAmount: newSessionFeeEnabled ? (newSessionFeeValue ?? 0) : 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.sessions.add(session);
    setSelectedSessionId(session.id);
    resetHandForm();
  };
  const saveHand = async () => {
    if (!activeRoomId || !activeSessionId || !scoreOk) return;
    if (requiresTieBreakSelection) {
      setTieBreakMessage("同点者の上位順を確定してから保存してください。");
      return;
    }
    const now = new Date().valueOf();
    const hand: HandRecord = {
      id: editingHandId ?? makeId(),
      roomId: activeRoomId,
      sessionId: activeSessionId,
      scores: parsedScores as [number, number, number, number],
      tieBreakOrders:
        selectedRoom?.tieRule === "seat"
          ? tieGroups.map((group) => ({
              score: group.score,
              playerIndexes: resolveTieOrder(group, tieBreakOrders),
            }))
          : undefined,
      createdAt: editingHandCreatedAt ?? now,
      updatedAt: now,
    };
    await db.hands.put(hand);
    resetHandForm();
  };
  const editHand = (hand: HandRecord) => {
    setEditingHandId(hand.id);
    setEditingHandCreatedAt(hand.createdAt);
    setScoreInputs(
      hand.scores.map(formatScoreInput) as typeof defaultScoreInputs,
    );
    setTieBreakOrders(hand.tieBreakOrders ?? []);
    setTieRankSelections(
      (hand.tieBreakOrders ?? []).map((order) => ({
        score: order.score,
        playerRanks: Object.fromEntries(
          order.playerIndexes.map((playerIndex, position) => [playerIndex, position + 1]),
        ) as Record<number, number>,
      })),
    );
  };
  const deleteHand = async (id: string) => {
    await db.hands.delete(id);
    if (editingHandId === id) resetHandForm();
  };
  const deleteSession = async (sessionId: string) => {
    await db.hands.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
    if (activeSessionId === sessionId) resetHandForm();
  };
  const deleteRoom = async (roomId: string) => {
    await db.transaction(
      "rw",
      db.rooms,
      db.sessions,
      db.hands,
      db.syncStates,
      async () => {
        await db.hands.where("roomId").equals(roomId).delete();
        await db.sessions.where("roomId").equals(roomId).delete();
        await db.syncStates.delete(roomId);
        await db.rooms.delete(roomId);
      },
    );
    if (activeRoomId === roomId) {
      setSelectedRoomId(null);
      setSelectedSessionId(null);
      resetHandForm();
    }
  };
  const updateRoom = async (
    changes: Partial<Pick<Room, "name" | "players">>,
  ) => {
    if (selectedRoom)
      await db.rooms.update(selectedRoom.id, {
        ...changes,
        updatedAt: new Date().valueOf(),
      });
  };
  const updateSessionFee = async (
    changes: Partial<Pick<Session, "feeEnabled" | "feeAmount">>,
  ) => {
    if (selectedSession)
      await db.sessions.update(selectedSession.id, {
        ...changes,
        updatedAt: new Date().valueOf(),
      });
  };
  const exportBackup = async () => {
    if (!selectedRoom) {
      setExportMessage("書き出すルームを選択してください。");
      return;
    }
    const sessions = await db.sessions
      .where("roomId")
      .equals(selectedRoom.id)
      .toArray();
    const backup: BackupData = {
      format: "mahjong-score-backup",
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      rooms: [selectedRoom],
      sessions,
      hands: await db.hands.where("roomId").equals(selectedRoom.id).toArray(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenameSafe(selectedRoom.name)}_${backupTimestamp()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(
      `${backup.rooms.length}件のルームをバックアップしました。`,
    );
  };
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      if (
        !window.confirm(
          `現在のデータを削除せずに取り込みます。\nルーム ${backup.rooms.length}件、対局日 ${backup.sessions.length}件、半荘 ${backup.hands.length}件を追加・更新します。\n\n続けますか？`,
        )
      )
        return;
      let updatedExistingRoom = false;
      await db.transaction("rw", db.rooms, db.sessions, db.hands, async () => {
        const existingRooms = await db.rooms.bulkGet(
          backup.rooms.map((room) => room.id),
        );
        const existingSessions = await db.sessions.bulkGet(
          backup.sessions.map((session) => session.id),
        );
        const existingHands = await db.hands.bulkGet(
          backup.hands.map((hand) => hand.id),
        );
        const roomsToPut = backup.rooms.filter(
          (room, index) =>
            !existingRooms[index] ||
            room.updatedAt > existingRooms[index].updatedAt,
        );
        updatedExistingRoom = backup.rooms.some(
          (room, index) =>
            Boolean(existingRooms[index]) &&
            room.updatedAt > existingRooms[index]!.updatedAt,
        );
        const sessionsToPut = backup.sessions.filter(
          (session, index) =>
            !existingSessions[index] ||
            session.updatedAt > existingSessions[index].updatedAt,
        );
        const handsToPut = backup.hands.filter(
          (hand, index) =>
            !existingHands[index] ||
            hand.updatedAt > existingHands[index].updatedAt,
        );
        await db.rooms.bulkPut(roomsToPut);
        await db.sessions.bulkPut(sessionsToPut);
        await db.hands.bulkPut(handsToPut);
      });
      setImportMessage(updatedExistingRoom ? "既存のルームを更新しました。" : "バックアップを取り込みました。");
    } catch (error) {
      setImportMessage(
        `復元できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`,
      );
    }
  };
  const mergeRemotePayload = async (payload: RoomSyncPayload) => {
    await db.transaction("rw", db.rooms, db.sessions, db.hands, async () => {
      const [existingRoom] = await db.rooms.bulkGet([payload.room.id]);
      const existingSessions = await db.sessions.bulkGet(
        payload.sessions.map((session) => session.id),
      );
      const existingHands = await db.hands.bulkGet(
        payload.hands.map((hand) => hand.id),
      );
      if (!existingRoom || payload.room.updatedAt > existingRoom.updatedAt)
        await db.rooms.put(payload.room);
      await db.sessions.bulkPut(
        payload.sessions.filter(
          (session, index) =>
            !existingSessions[index] ||
            session.updatedAt > existingSessions[index].updatedAt,
        ),
      );
      await db.hands.bulkPut(
        payload.hands.filter(
          (hand, index) =>
            !existingHands[index] ||
            hand.updatedAt > existingHands[index].updatedAt,
        ),
      );
    });
  };
  const saveToServer = async () => {
    if (!selectedRoom) return;
    setIsSyncing(true);
    setSyncMessage("サーバーへ保存しています…");
    try {
      const payload: RoomSyncPayload = {
        room: selectedRoom,
        sessions,
        hands: roomHands,
      };
      const result = await saveRemoteRoom(
        selectedRoom.id,
        syncState?.revision ?? 0,
        payload,
      );
      if (!result.ok) {
        setSyncMessage(
          result.code === "conflict"
            ? "競合: ほかの端末で更新されています。先に「サーバーから取得」を実行して内容を確認してください。"
            : `保存できませんでした: ${result.error ?? "不明なエラー"}`,
        );
        return;
      }
      await db.syncStates.put({
        roomId: selectedRoom.id,
        revision: result.revision ?? 0,
        updatedAt: result.updatedAt ?? Date.now(),
      });
      if (result.shareCode) await db.rooms.update(selectedRoom.id, { shareCode: result.shareCode });
      setSyncMessage("サーバーへ保存しました。");
    } catch (error) {
      setSyncMessage(
        `保存できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`,
      );
    } finally {
      setIsSyncing(false);
    }
  };
  const loadFromServer = async () => {
    if (!selectedRoom) return;
    setIsSyncing(true);
    setSyncMessage("サーバーから取得しています…");
    try {
      const result = await getRemoteRoom(selectedRoom.id);
      if (!result.ok) throw new Error(result.error ?? "不明なエラー");
      if (!result.payload) {
        setSyncMessage(
          "サーバーにはまだこのルームがありません。先に「サーバーへ保存」を実行してください。",
        );
        return;
      }
      await mergeRemotePayload(result.payload);
      await db.syncStates.put({
        roomId: selectedRoom.id,
        revision: result.revision ?? 0,
        updatedAt: result.updatedAt ?? Date.now(),
      });
      setSyncMessage(
        "サーバーのデータを取り込みました。端末内の別ルームは変更していません。",
      );
    } catch (error) {
      setSyncMessage(
        `取得できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`,
      );
    } finally {
      setIsSyncing(false);
    }
  };
  const joinRoomByShareCode = async () => {
    const shareCode = shareCodeInput.trim().toUpperCase();
    if (!shareCode) { setJoinMessage("共有コードを入力してください。"); return; }
    setJoinMessage("ルームを取得しています…");
    try {
      const result = await getRemoteRoomByShareCode(shareCode);
      if (!result.ok || !result.payload || !result.roomId) throw new Error(result.error ?? "ルームを取得できませんでした。");
      await mergeRemotePayload({ ...result.payload, room: { ...result.payload.room, shareCode: result.shareCode ?? shareCode } });
      await db.syncStates.put({ roomId: result.roomId, revision: result.revision ?? 0, updatedAt: result.updatedAt ?? Date.now() });
      setIsRoomJoinOpen(false);
      setShareCodeInput("");
      setJoinMessage("");
      window.location.hash = `/room/${encodeURIComponent(result.roomId)}`;
    } catch (error) {
      setJoinMessage(error instanceof Error ? error.message : "ルームを取得できませんでした。");
    }
  };
  const selectTieRank = (
    group: TieGroup,
    rankStart: number,
    playerIndex: number,
    rank: number,
  ) => {
    const current = tieRankSelections.find((selection) => selection.score === group.score);
    const playerRanks = { ...(current?.playerRanks ?? {}), [playerIndex]: rank };
    const selectedRanks = group.playerIndexes.map((index) => playerRanks[index]);
    const isComplete =
      selectedRanks.every(
        (value) =>
          Number.isInteger(value) &&
          value >= rankStart &&
          value < rankStart + group.playerIndexes.length,
      ) &&
      new Set(selectedRanks).size === group.playerIndexes.length;
    setTieRankSelections((selections) => [
      ...selections.filter((selection) => selection.score !== group.score),
      { score: group.score, playerRanks },
    ]);
    setTieBreakOrders((orders) => [
      ...orders.filter((order) => order.score !== group.score),
      ...(isComplete
        ? [{ score: group.score, playerIndexes: [...group.playerIndexes].sort((a, b) => playerRanks[a] - playerRanks[b]) }]
        : []),
    ]);
    setTieBreakMessage("");
  };
  const latestDate = (roomId: string) =>
    allSessions
      .filter((session) => session.roomId === roomId)
      .map((session) => session.date)
      .sort()
      .at(-1);
  const goHome = () => {
    window.location.hash = "";
    setSelectedRoomId(null);
    setSelectedSessionId(null);
    resetHandForm();
  };
  const goRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    resetHandForm();
    window.location.hash = `/room/${encodeURIComponent(roomId)}`;
  };
  const goAnalysis = () => {
    if (selectedRoom)
      window.location.hash = `/room/${encodeURIComponent(selectedRoom.id)}/analysis`;
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Mahjong Score</p>
          <h1>麻雀点数記録アプリ</h1>
          {selectedRoom && !isHomeView && (
            <p className="room-context">ルーム: {selectedRoom.name}</p>
          )}
        </div>
        {!isHomeView && (
          <div className="actions">
            <button className="ghost" onClick={goHome}>
              ルーム一覧
            </button>
            {isAnalysisView && (
              <button
                className="ghost"
                onClick={() => selectedRoom && goRoom(selectedRoom.id)}
              >
                ルーム画面
              </button>
            )}
          </div>
        )}
      </header>
      {isHomeView && (
        <>
          <RoomAddPanel
            message={importMessage}
            onCreate={() => setIsRoomCreateOpen(true)}
            onJoin={() => setIsRoomJoinOpen(true)}
            onImport={importBackup}
          />
          <RoomList
            rooms={rooms}
            activeRoomId={activeRoomId}
            latestDate={latestDate}
            onSelect={goRoom}
            onDelete={deleteRoom}
          />
        </>
      )}
      {isRoomCreateOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsRoomCreateOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="room-create-title">
            <div className="modal-title">
              <h2 id="room-create-title">ルーム作成</h2>
              <button className="ghost" onClick={() => setIsRoomCreateOpen(false)} aria-label="閉じる">×</button>
            </div>
            <RoomForm
              name={roomName}
              players={roomPlayers}
              uma={roomUma}
              oka={roomOka}
              tie={roomTie}
              canSave={roomCanSave}
              onNameChange={setRoomName}
              onPlayersChange={setRoomPlayers}
              onUmaChange={setRoomUma}
              onOkaChange={setRoomOka}
              onTieChange={setRoomTie}
              onSave={saveRoom}
              onClear={resetRoomForm}
            />
          </div>
        </div>
      )}
      {isRoomJoinOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsRoomJoinOpen(false); }}>
          <div className="modal join-modal" role="dialog" aria-modal="true" aria-labelledby="room-join-title">
            <div className="modal-title"><h2 id="room-join-title">共有コードで参加</h2><button className="ghost" onClick={() => setIsRoomJoinOpen(false)} aria-label="閉じる">×</button></div>
            <div className="modal-content">
              <label className="field">共有コード<input value={shareCodeInput} onChange={(event) => setShareCodeInput(event.target.value.toUpperCase())} maxLength={8} autoCapitalize="characters" /></label>
              <div className="actions"><button onClick={() => void joinRoomByShareCode()}>参加する</button></div>
              {joinMessage && <p className="small">{joinMessage}</p>}
            </div>
          </div>
        </div>
      )}
      {selectedRoom && isRoomView && (
        <>
          <div hidden={isAnalysisView}>
          <BackupPanel
            message={exportMessage}
            onExport={exportBackup}
          />
          <SyncPanel
            revision={syncState?.revision ?? 0}
            shareCode={selectedRoom.shareCode}
            isSyncing={isSyncing}
            message={syncMessage}
            onSave={saveToServer}
            onLoad={loadFromServer}
          />
          <section className="card" key={selectedRoom.id}>
            <div className="card-title">
              <h2>ルーム設定</h2>
            </div>
            <div className="small">
              <strong>ルール:</strong> {getUmaRule(selectedRoom.umaRule).label} /{" "}
              {getOkaRule(selectedRoom.okaRule).label} / 同点は
              {selectedRoom.tieRule === "seat" ? "席順" : "同着"}
            </div>
            <div className="grid">
              <label className="field">
                ルーム名
                <input
                  defaultValue={selectedRoom.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== selectedRoom.name)
                      void updateRoom({ name });
                  }}
                />
              </label>
              {selectedRoom.players.map((player, index) => (
                <label key={index} className="field">
                  プレイヤー{index + 1}
                  <input
                    defaultValue={player}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      if (!name || name === selectedRoom.players[index]) return;
                      const players = [
                        ...selectedRoom.players,
                      ] as Room["players"];
                      players[index] = name;
                      void updateRoom({ players });
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
          <SessionPanel
            roomName={selectedRoom.name}
            sessions={sessions}
            summaries={summaries}
            activeSessionId={activeSessionId}
            newDate={newSessionDate}
            feeEnabled={newSessionFeeEnabled}
            feeAmount={newSessionFeeAmount}
            feeValue={newSessionFeeValue}
            onDateChange={setNewSessionDate}
            onFeeEnabledChange={setNewSessionFeeEnabled}
            onFeeAmountChange={setNewSessionFeeAmount}
            onAdd={addSession}
            onSelect={(sessionId) => {
              setSelectedSessionId(sessionId);
              resetHandForm();
            }}
            onDelete={deleteSession}
          />
          {!selectedSession && (
            <section className="card">
              <p className="muted">対局日を追加すると点数を記録できます。</p>
            </section>
          )}
          {selectedSession && (
            <section className="card compact">
              <div className="card-title compact-title">
                <h2>{selectedSession.date} の点数記録</h2>
                <div className="compact-meta">
                  <span className={scoreOk ? "badge ok" : "badge warn"}>
                    合計: {scoreReady ? scoreTotal : "未入力"}
                  </span>
                  {scoreReady && !scoreOk && (
                    <span className="alert-inline">
                      100000点に揃っていません
                    </span>
                  )}
                </div>
              </div>
              <div className="actions">
                <label className="field checkbox inline-field">
                  この日の場代計算
                  <input
                    type="checkbox"
                    checked={selectedSession.feeEnabled}
                    onChange={(event) =>
                      void updateSessionFee({
                        feeEnabled: event.target.checked,
                        feeAmount: event.target.checked
                          ? selectedSession.feeAmount
                          : 0,
                      })
                    }
                  />
                </label>
                {selectedSession.feeEnabled && (
                  <label className="field inline-field">
                    場代
                    <input
                      type="number"
                      min="1"
                      defaultValue={selectedSession.feeAmount || ""}
                      onBlur={(event) => {
                        const amount = parsePositiveInt(event.target.value);
                        if (amount !== null)
                          void updateSessionFee({ feeAmount: amount });
                      }}
                    />
                  </label>
                )}
              </div>
              <HandTable
                room={selectedRoom}
                summary={selectedSummary}
                feeEnabled={selectedSession.feeEnabled}
                hands={hands}
                editingHandId={editingHandId}
                scoreInputs={scoreInputs}
                scoreOk={scoreOk}
                handPreview={handPreview ?? undefined}
                onScoreInputsChange={setScoreInputs}
                onSave={saveHand}
                onEdit={editHand}
                onDelete={deleteHand}
                formatAmount={formatAmount}
              />
              {selectedRoom.tieRule === "seat" && tieGroups.length > 0 && (
                <div className="tie-break">
                  <strong>同点時の上位順</strong>
                  <p className="small">
                    各同点グループで上位順を確定してから保存してください。
                  </p>
                  {tieBreakMessage && (
                    <p className="alert-inline">{tieBreakMessage}</p>
                  )}
                  {tieGroups.map((group) => {
                    const rankStart =
                      (parsedScores as number[]).filter(
                        (score) => score > group.score,
                      ).length + 1;
                    return (
                    <div key={group.score} className="tie-group">
                      <span>{group.score}点:</span>
                      {group.playerIndexes.map((playerIndex) => {
                        const selection = tieRankSelections.find(
                          (item) => item.score === group.score,
                        );
                        return (
                          <span key={playerIndex} className="tie-player">
                            {selectedRoom.players[playerIndex]}
                            <select
                              aria-label={`${selectedRoom.players[playerIndex]}の順位`}
                              value={selection?.playerRanks[playerIndex] ?? ""}
                              onChange={(event) =>
                                selectTieRank(
                                  group,
                                  rankStart,
                                  playerIndex,
                                  Number(event.target.value),
                                )
                              }
                            >
                              <option value="">順位を選択</option>
                              {group.playerIndexes.map((_, index) => (
                                <option key={index} value={rankStart + index}>
                                  {rankStart + index}位
                                </option>
                              ))}
                            </select>
                          </span>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          <div className="actions analysis-link">
            <button onClick={goAnalysis}>分析を見る</button>
          </div>
          </div>
          <div hidden={!isAnalysisView}>
          <section className="card">
            <div className="card-title">
              <h2>分析対象の対局日</h2>
            </div>
            <div className="actions analysis-range-actions">
              <label className="field inline-field">
                開始日
                <select
                  value={analysisStartSessionId}
                  onChange={(event) => setAnalysisStartSessionId(event.target.value)}
                >
                  <option value="">指定なし</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>{session.date}</option>
                  ))}
                </select>
              </label>
              <label className="field inline-field">
                終了日
                <select
                  value={analysisEndSessionId}
                  onChange={(event) => setAnalysisEndSessionId(event.target.value)}
                >
                  <option value="">指定なし</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>{session.date}</option>
                  ))}
                </select>
              </label>
              <button
                className="ghost"
                onClick={() => {
                  setAnalysisStartSessionId("");
                  setAnalysisEndSessionId("");
                }}
              >
                クリア
              </button>
            </div>
            {hasInvalidAnalysisRange && (
              <p className="alert-inline">開始日は終了日以前を選択してください。</p>
            )}
          </section>
          <section className="card">
            <div className="card-title">
              <h2>通算成績</h2>
              <div className="compact-meta">
                {hasSessionFees && (
                  <label className="field checkbox inline-field">
                    総場代を表示
                    <input
                      type="checkbox"
                      checked={showTotalFees}
                      onChange={(event) =>
                        setShowTotalFees(event.target.checked)
                      }
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>プレイヤー</th>
                    <th>総得点 / 総収支</th>
                    <th>平均得点</th>
                    <th>平均順位</th>
                    <th>飛び率</th>
                    {showTotalFees && <th>総場代</th>}
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((stat) => {
                    const completed = stat.ranks.length;
                    const bustRate = stat.finalScores.length
                      ? `${((stat.finalScores.filter((score) => score < 0).length / stat.finalScores.length) * 100).toFixed(1)}%`
                      : "-";
                    return (
                      <tr key={stat.player}>
                        <th>{stat.player}</th>
                        <td>{stat.totalPoints.toFixed(1)}pt</td>
                        <td>
                          {stat.sessionCount
                            ? stat.averagePoints.toFixed(1)
                            : "-"}
                        </td>
                        <td>{completed ? stat.averageRank.toFixed(2) : "-"}</td>
                        <td>{bustRate}</td>
                        {showTotalFees && <td>{formatAmount(stat.fee)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="card-title">
              <h2>合計ポイントの推移</h2>
              <label className="field inline-field chart-player-select">
                強調するプレイヤー
                <select
                  value={activeHighlightedPlayerIndex ?? ""}
                  onChange={(event) =>
                    setHighlightedPlayerIndex(
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                >
                  <option value="">なし</option>
                  {selectedRoom.players.map((player, index) => (
                    <option key={player} value={index}>
                      {player}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!totalPointSeries.length ? (
              <p className="muted">半荘を記録すると推移を表示できます。</p>
            ) : (
              <PointTrendChart
                series={totalPointSeries}
                players={selectedRoom.players}
                highlightedPlayerIndex={activeHighlightedPlayerIndex}
                label="プレイヤー別の合計ポイント推移"
              />
            )}
          </section>
          <section className="card">
            <div className="card-title">
              <h2>日別総合ポイントの推移</h2>
            </div>
            <p className="small">対局日の半荘ポイント合計</p>
            {!dailyPointSeries.length ? (
              <p className="muted">半荘を記録すると推移を表示できます。</p>
            ) : (
              <PointTrendChart
                series={dailyPointSeries}
                players={selectedRoom.players}
                highlightedPlayerIndex={activeHighlightedPlayerIndex}
                label="プレイヤー別の日別総合ポイント推移"
              />
            )}
          </section>
          <section className="card">
            <div className="card-title">
              <h2>順位分布</h2>
            </div>
            <div className="table-wrap">
              <table className="stats-table rank-distribution">
                <thead>
                  <tr>
                    <th>順位</th>
                    {playerStats.map((stat) => (
                      <th key={stat.player}>{stat.player}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((rank) => (
                    <tr key={rank}>
                      <th>{rank}位</th>
                      {playerStats.map((stat) => {
                        const rate = stat.ranks.length
                          ? (stat.ranks.filter((value) => value === rank)
                              .length /
                              stat.ranks.length) *
                            100
                          : 0;
                        return (
                          <td key={stat.player}>
                            <span
                              className="rank-rate"
                              style={{
                                backgroundColor: `hsl(142 35% ${100 - rate * 0.35}%)`,
                              }}
                            >
                              {stat.ranks.length ? `${rate.toFixed(1)}%` : "-"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
