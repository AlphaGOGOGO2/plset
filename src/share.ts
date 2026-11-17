import type { Session } from './domain';

// Sessions saved before logs carried a private flag still hold patron entries as plain text.
const LEGACY_PATRON_LOG = /귀인 (펀딩|초기화)/;

/** The only place that decides what leaves this PC: no patrons, no patron log lines. */
export function toShared(s: Session): Session {
  return { ...s, patrons: [], logs: s.logs.filter(log => !log.private && !LEGACY_PATRON_LOG.test(log.text)) };
}

/** True when an update changed the patron list and nothing else (compared by reference, as commits spread the previous session). */
export function patronOnly(prev: Session, next: Session) {
  if (prev.patrons === next.patrons) return false;
  const a = prev as unknown as Record<string, unknown>, b = next as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => key === 'patrons' || a[key] === b[key]);
}

/** Shifts host wall-clock timestamps onto this PC's clock. offset = host now − local now. */
export function rebaseClock(s: Session, offset: number): Session {
  return {
    ...s,
    timer: { ...s.timer, deadline: s.timer.deadline === null ? null : s.timer.deadline - offset },
    draw: s.draw ? { ...s.draw, startedAt: s.draw.startedAt - offset, finishedAt: s.draw.finishedAt === null ? null : s.draw.finishedAt - offset } : s.draw,
    ...(s.mapDraw ? { mapDraw: { ...s.mapDraw, startedAt: s.mapDraw.startedAt - offset } } : {}),
  };
}

/** Every received message is freshly parsed JSON; reuse the previous objects where content is equal so effects keyed on them (a running draw) do not restart. */
export function shareStructure(prev: Session | null, next: Session): Session {
  if (!prev) return next;
  const out = { ...next } as unknown as Record<string, unknown>, old = prev as unknown as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const a = old[key], b = out[key];
    if (a !== b && typeof b === 'object' && b !== null && JSON.stringify(a) === JSON.stringify(b)) out[key] = a;
  }
  return out as unknown as Session;
}
