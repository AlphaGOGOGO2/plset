import { validateSession, type Session } from './domain';
import { PAGES, type Page, type RoomId } from './mode';
import { toShared } from './share';

export type HostStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'replaced' | 'login' | 'closed';
export type ViewerStatus = 'connecting' | 'live' | 'waiting' | 'reconnecting' | 'closed' | 'stale';
export type ViewerState = { session: Session; page: Page; hostNow: number };
export type ViewerEvent = ({ t: 'state' } & ViewerState) | { t: 'host'; online: boolean } | { t: 'closed' } | { t: 'stale' };

const SEND_DEBOUNCE = 150, PING_MS = 45000, CODE_REPLACED = 4000, CODE_CLOSED = 4001;
const socketUrl = (url: string) => url.replace(/^http/, 'ws');

export const backoff = (attempt: number, random: () => number = Math.random) => Math.min(30000, 1000 * 2 ** attempt) * (0.5 + random() / 2);

export async function fetchMe(): Promise<{ account: string | null; url: string }> {
  const res = await fetch('/api/live/me', { cache: 'no-store' });
  if (!res.ok) throw new Error('live/me');
  return res.json();
}

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
    if (m?.t !== 'state' || !Number.isFinite(m.rev) || m.rev <= lastRev) return null;
    try {
      const session = validateSession(m.session);
      invalid = 0; lastRev = m.rev;
      return { t: 'state', session, page: PAGES.includes(m.page) ? m.page : 'board', hostNow: Number(m.sentAt) + (Number(m.age) || 0) };
    } catch { return ++invalid >= 3 ? { t: 'stale' } : null; }
  };
}

export function connectHost(account: string, url: string, onStatus: (status: HostStatus) => void) {
  let ws: WebSocket | null = null, stopped = false, attempt = 0, rev = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined, ping: ReturnType<typeof setInterval> | undefined;
  let latest: { session: Session; page: Page } | null = null;
  const flush = () => {
    debounce = undefined;
    if (!latest || ws?.readyState !== WebSocket.OPEN) return;
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
      const socket = new WebSocket(`${socketUrl(url)}/rooms/${account}/ws?token=${token}`);
      ws = socket;
      socket.onopen = () => { attempt = 0; onStatus('live'); flush(); clearInterval(ping); ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, PING_MS); };
      socket.onmessage = event => {
        if (event.data === 'pong') return;
        try { const m = JSON.parse(event.data); if (m.t === 'replaced') end('replaced'); else if (m.t === 'closed') end('closed'); } catch { /* ignore */ }
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
    stop() { stopped = true; clearTimeout(debounce); clearTimeout(retry); clearInterval(ping); const socket = ws; ws = null; socket?.close(1000, 'leaving'); },
  };
}

export function connectViewer(room: RoomId, url: string, onState: (state: ViewerState) => void, onStatus: (status: ViewerStatus) => void) {
  let ws: WebSocket | null = null, stopped = false, attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined, ping: ReturnType<typeof setInterval> | undefined;
  const inbox = viewerInbox(); // lives across reconnects so a replayed older state is still dropped
  const end = (status: ViewerStatus) => { stopped = true; clearInterval(ping); onStatus(status); };
  const again = () => { if (stopped) return; onStatus('reconnecting'); retry = setTimeout(open, backoff(attempt++)); };
  function open() {
    if (stopped) return;
    const socket = new WebSocket(`${socketUrl(url)}/rooms/${room}/ws`);
    ws = socket;
    socket.onopen = () => { attempt = 0; clearInterval(ping); ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, PING_MS); };
    socket.onmessage = event => {
      const next = inbox(String(event.data));
      if (!next) return;
      if (next.t === 'state') onState(next);
      else if (next.t === 'host') onStatus(next.online ? 'live' : 'waiting');
      else end(next.t);
    };
    socket.onclose = event => {
      if (ws !== socket) return;
      ws = null; clearInterval(ping);
      if (event.code === CODE_CLOSED) end('closed'); else again();
    };
  }
  onStatus('connecting');
  open();
  return () => { stopped = true; clearTimeout(retry); clearInterval(ping); const socket = ws; ws = null; socket?.close(1000, 'leaving'); };
}
