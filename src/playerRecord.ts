// A player's pro league record for one month, served by the site's own /api/proleague/record (which reads EloBoard).
// Everything here is React- and DOM-free so the tests can import it directly.
import data from './eloboard-ids.json';
import type { Player, Race } from './domain';
import { rosterForPlayer } from './roster';

export interface WinLoss { wins: number; losses: number }
/** The server reads the whole month. `complete: false` is the rare case where it could not (15+ games against one race in a single day, or a very long month), so some games may be missing. */
export interface RaceRecord extends WinLoss { complete: boolean }
export interface PlayerRecord { playerId: number; month: string; total: WinLoss; vs: Record<Race, RaceRecord>; complete: boolean; url: string; fetchedAt: number }

export const RECORD_ENDPOINT = '/api/proleague/record';
/** Display order of the opponent races. */
export const VS_RACES: { race: Race; label: string }[] = [{ race: 'T', label: '대 테란' }, { race: 'Z', label: '대 저그' }, { race: 'P', label: '대 토스' }];
const IDS = data.ids as Record<string, number>;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const KST_OFFSET = 9 * 60 * 60 * 1000;

/** The calendar month in Asia/Seoul (UTC+9, no daylight saving) as YYYY-MM. */
export function currentMonth(now: number): string { return new Date(now + KST_OFFSET).toISOString().slice(0, 7); }
/** '2026-11' -> '2026년 11월'. */
export function monthLabel(month: string): string { const [year, m] = month.split('-'); return `${year}년 ${Number(m)}월`; }
/** '58.8%', or a dash when no games were played. */
export function winRate(wins: number, losses: number): string { const games = wins + losses; return games > 0 ? `${(wins / games * 100).toFixed(1)}%` : '–'; }
/** The EloBoard player id for a session player, or null when the player is not on the roster (custom names) or has no id mapped. */
export function eloboardId(p: Pick<Player, 'name' | 'rosterId'>): number | null {
  const roster = rosterForPlayer(p), id = roster && Object.hasOwn(IDS, roster.id) ? IDS[roster.id] : null;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}
/** The EloBoard page the record comes from; used as the source link until the server supplies its own `url`. */
export function eloboardUrl(playerId: number, month: string): string { return `https://eloboard.com/players/${playerId}?tab=matches&category=pro_league&month=${month}&by=month`; }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const winLoss = (v: unknown): WinLoss | null => isObject(v) && isCount(v.wins) && isCount(v.losses) ? { wins: v.wins, losses: v.losses } : null;
function raceRecord(v: unknown): RaceRecord | null { const wl = winLoss(v); return wl && isObject(v) && typeof v.complete === 'boolean' ? { ...wl, complete: v.complete } : null; }
/** Only https links to eloboard.com are rendered, so a bad payload cannot plant a javascript: or look-alike link. */
function sourceUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try { const url = new URL(v); return url.protocol === 'https:' && (url.hostname === 'eloboard.com' || url.hostname.endsWith('.eloboard.com')) ? url.href : null; } catch { return null; }
}
/** Returns a clean copy of a well-formed response body, or null for anything else. The payload is treated as untrusted. */
export function parseRecord(value: unknown): PlayerRecord | null {
  if (!isObject(value) || !isObject(value.vs)) return null;
  const total = winLoss(value.total), T = raceRecord(value.vs.T), Z = raceRecord(value.vs.Z), P = raceRecord(value.vs.P), url = sourceUrl(value.url);
  if (!total || !T || !Z || !P || !url) return null;
  if (!isCount(value.playerId) || value.playerId === 0 || typeof value.month !== 'string' || !MONTH.test(value.month)) return null;
  if (typeof value.complete !== 'boolean' || typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt)) return null;
  return { playerId: value.playerId, month: value.month, total, vs: { T, Z, P }, complete: value.complete, url, fetchedAt: value.fetchedAt };
}

/** Fetches one player's month. Rejects with an Error whose message is ready to show (the server's own message when it sent one). */
export async function fetchRecord(playerId: number, month: string, signal?: AbortSignal): Promise<PlayerRecord> {
  let response: Response;
  try { response = await fetch(`${RECORD_ENDPOINT}?player=${encodeURIComponent(playerId)}&month=${encodeURIComponent(month)}`, { signal, headers: { accept: 'application/json' } }); }
  catch (e) { if (signal?.aborted) throw e; throw new Error('전적 서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.'); }
  const body: unknown = await response.json().catch(() => null);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!response.ok) throw new Error(isObject(body) && typeof body.error === 'string' && body.error.trim() ? body.error.trim().slice(0, 200) : `전적을 불러오지 못했습니다. (HTTP ${response.status})`);
  const record = parseRecord(body);
  if (!record || record.playerId !== playerId || record.month !== month) throw new Error('전적 서버의 응답을 읽을 수 없습니다.');
  return record;
}

// Records are loaded ahead of time when a player joins the session, so the modal usually opens with the numbers ready.
// One request at a time: the server reads the source with a pause between pages and only works on two records at once.
export const RECORD_TTL_MS = 15 * 60 * 1000;
type Entry = { promise: Promise<PlayerRecord>; at: number; started: boolean; dropped: boolean };
const entries = new Map<string, Entry>();
let queue: Promise<unknown> = Promise.resolve();
const keyOf = (playerId: number, month: string) => `${playerId}:${month}`;

/**
 * The player's record, from memory when it was loaded in the last 15 minutes. A background load (`urgent: false`) waits its
 * turn behind earlier ones; an urgent load (someone opened the modal) starts at once, even if the same player is still waiting in line.
 */
export function loadRecord(playerId: number, month: string, { urgent = true, now = Date.now() }: { urgent?: boolean; now?: number } = {}): Promise<PlayerRecord> {
  const key = keyOf(playerId, month), hit = entries.get(key);
  if (hit && now - hit.at < RECORD_TTL_MS && (hit.started || !urgent)) return hit.promise;
  if (hit) hit.dropped = true;
  const entry: Entry = { at: now, started: urgent, dropped: false, promise: Promise.resolve(null as never) };
  const run = () => { entry.started = true; return fetchRecord(playerId, month); };
  if (urgent) entry.promise = run();
  else {
    // A waiting load that was taken over by an urgent one resolves with that one's result instead of fetching twice.
    entry.promise = queue.then(() => entry.dropped ? entries.get(key)?.promise ?? run() : run());
    queue = entry.promise.catch(() => {});
  }
  entries.set(key, entry);
  // A failure is not remembered, so the next open or the retry button fetches again.
  entry.promise.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
  return entry.promise;
}
/** Starts background loads for players whose record is not in memory yet. Failures are silent; the modal reports them when opened. */
export function preloadRecords(playerIds: number[], month: string, now = Date.now()): void {
  for (const id of new Set(playerIds)) { const hit = entries.get(keyOf(id, month)); if (!hit || now - hit.at >= RECORD_TTL_MS) void loadRecord(id, month, { urgent: false, now }).catch(() => {}); }
}
/** Forgets a player's record so the next load fetches it again (the modal's retry button). */
export function forgetRecord(playerId: number, month: string): void { const key = keyOf(playerId, month), hit = entries.get(key); if (hit) hit.dropped = true; entries.delete(key); }
