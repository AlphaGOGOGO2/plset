import { validateSession, type Session } from './domain';
import type { ScoreboardPatch } from './scoreboard';
import { PAGES, type Page, type RoomId } from './mode';
import { toShared } from './share';
import type { AccountSave } from './accountSync';

export type HostStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'replaced' | 'login' | 'closed';
export type ViewerStatus = 'connecting' | 'live' | 'waiting' | 'reconnecting' | 'closed' | 'stale';
export type ViewerState = { session: Session; page: Page; hostNow: number };
export type ViewerEvent = ({ t: 'state' } & ViewerState) | { t: 'host'; online: boolean } | { t: 'closed' } | { t: 'stale' } | { t: 'prefs'; prefs: unknown } | { t: 'error'; code: string };
/** A streamer's own overlay settings, saved in the room under the random key in their OBS link (see ScoreboardPage). */
export type PrefsMessage = { key: string; prefs: unknown };
const prefsFrame = (p: PrefsMessage) => JSON.stringify({ t: 'prefs', key: p.key, prefs: p.prefs });

const CLOSED_RETRY_MS = 10000, SEND_DEBOUNCE = 150, PING_MS = 45000, CODE_REPLACED = 4000, CODE_CLOSED = 4001, SAVE_WAIT_MS = 1500;
const socketUrl = (url: string) => url.replace(/^http/, 'ws');

export const backoff = (attempt: number, random: () => number = Math.random) => Math.min(30000, 1000 * 2 ** attempt) * (0.5 + random() / 2);

export async function fetchMe(): Promise<{ account: string | null; scorer?: string | null; url: string }> {
  const res = await fetch('/api/live/me', { cache: 'no-store' });
  if (!res.ok) throw new Error('live/me');
  return res.json();
}

/** 방싸개 login: an account that may edit the scoreboard of the room it watches. Resolves to an error message on failure. */
export async function scorerLogin(id: string, password: string): Promise<string | null> {
  try {
    const res = await fetch('/api/live/scorer', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? '로그인하지 못했습니다.';
  } catch { return '서버에 연결하지 못했습니다.'; }
}
export async function scorerLogout() { await fetch('/api/live/scorer', { method: 'DELETE', cache: 'no-store' }).catch(() => undefined); }

/** Ends the broadcast: the site closes the room in the Worker, which disconnects every viewer. */
export async function closeRoom() {
  const res = await fetch('/api/live/close', { method: 'POST', cache: 'no-store' });
  if (!res.ok) throw new Error('live/close');
}

/** Turns raw server frames into events. Pure, so the ordering and validation rules are testable without a socket. */
export function viewerInbox() {
  let lastRev = -Infinity, invalid = 0;
  return (raw: string): ViewerEvent | null => {
    let m: any;
    try { m = JSON.parse(raw); } catch { return null; }
    if (m?.t === 'host') return { t: 'host', online: !!m.online };
    if (m?.t === 'closed') return { t: 'closed' };
    if (m?.t === 'prefs') return { t: 'prefs', prefs: m.prefs };
    if (m?.t === 'error' && typeof m.code === 'string') return { t: 'error', code: m.code };
    if (m?.t !== 'state' || !Number.isFinite(m.rev) || m.rev <= lastRev) return null;
    try {
      const session = validateSession(m.session);
      invalid = 0; lastRev = m.rev;
      return { t: 'state', session, page: PAGES.includes(m.page) ? m.page : 'board', hostNow: Number(m.sentAt) + (Number(m.age) || 0) };
    } catch { return ++invalid >= 3 ? { t: 'stale' } : null; }
  };
}

/**
 * `onSave`: the account's saved console, sent by the room right after connecting and again whenever another console of
 * the account saves (see accountSync.ts); `onSaved`: the room's stamp for a save this console sent. `device`: this
 * browser's id, so its new connection replaces its own old one instead of counting as one more console.
 */
export function connectHost(account: string, url: string, onStatus: (status: HostStatus) => void, onScoreboard: (patch: unknown) => void = () => {},
  { onSave, onSaved, device }: { onSave?: (save: AccountSave) => void; onSaved?: (at: number) => void; device?: string | null } = {}) {
  let ws: WebSocket | null = null, stopped = false, attempt = 0, rev = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined, ping: ReturnType<typeof setInterval> | undefined;
  let latest: { session: Session; page: Page } | null = null, prefs: PrefsMessage | null = null;
  // Nothing is broadcast on a new connection until the room has handed over the account's save (its first frame), so a
  // console on a new computer shows viewers the account's session, never its own empty one first. A room that sends no
  // save (an older server) is waited for only SAVE_WAIT_MS.
  let released = false, release: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    debounce = undefined;
    if (!latest || !released || ws?.readyState !== WebSocket.OPEN) return;
    // Wall-clock based so revisions keep increasing across reloads; viewers drop anything not newer.
    rev = Math.max(rev + 1, Date.now());
    ws.send(JSON.stringify({ t: 'state', rev, sentAt: Date.now(), page: latest.page, session: toShared(latest.session) }));
  };
  const end = (status: HostStatus) => { stopped = true; clearInterval(ping); onStatus(status); };
  const again = () => { if (stopped) return; onStatus(attempt >= 3 ? 'down' : 'reconnecting'); retry = setTimeout(open, backoff(attempt++)); };
  async function open() {
    if (stopped) return;
    try {
      const res = await fetch('/api/live/token', { method: 'POST', cache: 'no-store' });
      if (res.status === 401) { end('login'); return; }
      if (!res.ok) throw new Error('token');
      const { token } = await res.json() as { token: string };
      if (stopped) return;
      const socket = new WebSocket(`${socketUrl(url)}/rooms/${account}/ws?token=${token}${device ? `&dev=${device}` : ''}`);
      ws = socket;
      socket.onopen = () => { attempt = 0; onStatus('live'); released = false; clearTimeout(release); release = setTimeout(() => { released = true; flush(); }, SAVE_WAIT_MS); if (prefs) socket.send(prefsFrame(prefs)); clearInterval(ping); ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, PING_MS); };
      socket.onmessage = event => {
        if (event.data === 'pong') return;
        try { const m = JSON.parse(event.data); if (m.t === 'replaced') end('replaced'); else if (m.t === 'closed') end('closed'); else if (m.t === 'scoreboard') onScoreboard(m.patch);
          else if (m.t === 'save' && Number.isFinite(m.at)) { onSave?.({ at: m.at, by: typeof m.by === 'string' ? m.by : null, data: m.data && typeof m.data === 'object' ? m.data : null }); if (!released) { clearTimeout(release); released = true; flush(); } }
          else if (m.t === 'saved' && Number.isFinite(m.at)) onSaved?.(m.at); } catch { /* ignore */ }
      };
      socket.onclose = event => {
        if (ws !== socket) return;
        ws = null; clearInterval(ping);
        if (event.code === CODE_REPLACED) end('replaced'); else if (event.code === CODE_CLOSED) end('closed'); else again();
      };
    } catch { again(); }
  }
  onStatus('connecting');
  void open();
  return {
    send(session: Session, page: Page) { latest = { session, page }; if (debounce === undefined) debounce = setTimeout(flush, SEND_DEBOUNCE); },
    /** Takes a session another console of the account already broadcast: it becomes what a reconnect would send, but is not sent now. */
    keep(session: Session) { if (latest) latest = { ...latest, session }; },
    /** Saves this console's overlay settings now, or as soon as the connection opens. */
    sendPrefs(next: PrefsMessage) { prefs = next; if (ws?.readyState === WebSocket.OPEN) ws.send(prefsFrame(next)); },
    /** Saves the whole console under the account, patrons included: unlike `send`, this copy only ever returns to a host. False when not connected. */
    sendSave(by: string, session: Session, local: Record<string, string>) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify({ t: 'save', by, data: { session, local } }));
      return true;
    },
    stop() { stopped = true; clearTimeout(debounce); clearTimeout(retry); clearTimeout(release); clearInterval(ping); const socket = ws; ws = null; socket?.close(1000, 'leaving'); },
  };
}

/**
 * `waitForOpen`: a broadcast source (an ?output page in OBS) is added once and left running, often before the host opens
 * the room or across broadcasts, so a closed room is checked again every CLOSED_RETRY_MS instead of ending the page.
 */
export function connectViewer(room: RoomId, url: string, onState: (state: ViewerState) => void, onStatus: (status: ViewerStatus) => void, waitForOpen = false, scorer = false,
  /** `me`: an OBS page's key, whose settings the room pushes to `onPrefs` (on connecting and whenever they change). */
  /** `onError`: the room refused something this console sent (e.g. a 방싸개 edit while the host is away: "no_host"). */
  /** `onScorerLost`: the 방싸개 login is no longer valid (expired or removed); the connection carries on as a plain viewer. */
  { me, onPrefs, onError, onScorerLost }: { me?: string | null; onPrefs?: (prefs: unknown) => void; onError?: (code: string) => void; onScorerLost?: () => void } = {}) {
  let ws: WebSocket | null = null, stopped = false, attempt = 0, prefs: PrefsMessage | null = null, hasToken = false;
  let retry: ReturnType<typeof setTimeout> | undefined, ping: ReturnType<typeof setInterval> | undefined;
  let inbox = viewerInbox(); // lives across reconnects so a replayed older state is still dropped
  const end = (status: ViewerStatus) => {
    clearInterval(ping);
    // The next broadcast starts its revisions afresh (on the host's clock), so forget this one's before waiting for it.
    if (waitForOpen && status === 'closed') { inbox = viewerInbox(); onStatus('closed'); clearTimeout(retry); retry = setTimeout(open, CLOSED_RETRY_MS); return; }
    stopped = true; onStatus(status);
  };
  const again = () => { if (stopped) return; onStatus('reconnecting'); retry = setTimeout(open, backoff(attempt++)); };
  // A 방싸개 connects with a scorer token, which also lets it send scoreboard edits. Without a valid login it just watches.
  async function scorerToken() {
    if (!scorer) return null;
    try {
      const res = await fetch('/api/live/scorer/token', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room }) });
      if (res.status === 401) { scorer = false; onScorerLost?.(); return null; }
      return res.ok ? ((await res.json()) as { token: string }).token : null;
    } catch { return null; }
  }
  async function open() {
    if (stopped) return;
    const token = await scorerToken();
    if (stopped) return;
    hasToken = !!token;
    const query = [...(token ? [`scorer=${token}`] : []), ...(me ? [`me=${encodeURIComponent(me)}`] : [])];
    const socket = new WebSocket(`${socketUrl(url)}/rooms/${room}/ws${query.length ? `?${query.join('&')}` : ''}`);
    ws = socket;
    socket.onopen = () => { attempt = 0; clearInterval(ping); if (prefs) socket.send(prefsFrame(prefs)); ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, PING_MS); };
    socket.onmessage = event => {
      const next = inbox(String(event.data));
      if (!next) return;
      if (next.t === 'state') onState(next);
      else if (next.t === 'host') onStatus(next.online ? 'live' : 'waiting');
      else if (next.t === 'prefs') onPrefs?.(next.prefs);
      else if (next.t === 'error') onError?.(next.code);
      else end(next.t);
    };
    socket.onclose = event => {
      if (ws !== socket) return;
      ws = null; clearInterval(ping);
      if (event.code === CODE_CLOSED) end('closed'); else again();
    };
  }
  onStatus('connecting');
  void open();
  return {
    stop() { stopped = true; clearTimeout(retry); clearInterval(ping); const socket = ws; ws = null; socket?.close(1000, 'leaving'); },
    sendPrefs(next: PrefsMessage) { prefs = next; if (ws?.readyState === WebSocket.OPEN) ws.send(prefsFrame(next)); },
    /** 방싸개 only: false when the edit could not be sent (not connected, or connected without a scorer token). */
    sendScoreboard(patch: ScoreboardPatch) {
      if (!scorer || !hasToken || ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify({ t: 'scoreboard', patch }));
      return true;
    },
  };
}
