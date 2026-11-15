export type Page = 'board' | 'teams' | 'pinball' | 'wheel' | 'race' | 'patrons' | 'settlement';
export const PAGES: Page[] = ['board', 'teams', 'pinball', 'wheel', 'race', 'patrons', 'settlement'];
export const ROOM_NAMES = { major: '메이저 프로리그', kleague: 'K리그' } as const;
export type RoomId = keyof typeof ROOM_NAMES;
// solo: this browser only. host: broadcasts every change. watch: renders what the host broadcasts.
export type Mode = { kind: 'solo' } | { kind: 'host' } | { kind: 'watch'; room: RoomId };

const page = (value: string | undefined): Page => PAGES.includes(value as Page) ? value as Page : 'board';

export function parseHash(hash: string): { mode: Mode; page: Page } {
  const [head, tail] = hash.replace(/^#/, '').split('/');
  if (head === 'host') return { mode: { kind: 'host' }, page: page(tail) };
  if (head.startsWith('watch=')) {
    const room = head.slice(6);
    if (room in ROOM_NAMES) return { mode: { kind: 'watch', room: room as RoomId }, page: page(tail) };
    return { mode: { kind: 'solo' }, page: 'board' };
  }
  return { mode: { kind: 'solo' }, page: page(head) };
}

export function buildHash(mode: Mode, target: Page) {
  if (mode.kind === 'solo') return `#${target}`;
  const head = mode.kind === 'host' ? 'host' : `watch=${mode.room}`;
  return target === 'board' ? `#${head}` : `#${head}/${target}`;
}
// A viewer who is following goes wherever the host is. Picking a tab by hand switches following off, so no page needs an exception.
export const followTarget = (follow: boolean, hostPage: Page | null | undefined, current: Page): Page | null => follow && hostPage && hostPage !== current ? hostPage : null;
