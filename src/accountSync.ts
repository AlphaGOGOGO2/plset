// A host account's console follows the account, not the computer: the room keeps one private copy of the whole session
// and of the browser settings below, hands it to every host connection, and takes each change back (see live.ts).
// The room stamps every save with its own clock (`at`) and the device that sent it (`by`), so consoles never compare clocks.

/** Browser settings that travel with the account: my broadcast settings, my OBS link key, dark/light, roster view. */
export const SYNC_KEYS = ['plset.scoreboard.mine', 'plset.scoreboard.key', 'plset.scoreboard.base', 'plset.mode', 'plset.participantView'];
const DEVICE_KEY = 'plset.device';

export type AccountSave = { at: number; by: string | null; data: { session: unknown; local?: Record<string, string> } | null };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** This browser's random id, made once. Null when storage is unavailable (the console then never takes another device's save for its own). */
export function deviceId(store: Store = localStorage): string | null {
  try {
    const saved = store.getItem(DEVICE_KEY);
    if (saved && /^[a-z0-9]{8,40}$/.test(saved)) return saved;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    store.setItem(DEVICE_KEY, id);
    return id;
  } catch { return null; }
}

/**
 * Whether the room's save replaces what this browser holds: only when another device wrote it and this browser has not
 * taken that very save already (`seen` is the stamp of the last save this browser sent or took). Our own last save, or
 * one we already took, means this browser is the one that is up to date, also with edits made while offline.
 */
export const shouldAdopt = (save: AccountSave, device: string | null, seen: number) => !!save.data && save.by !== device && save.at !== seen;

export function readLocal(store: Store = localStorage): Record<string, string> {
  const out: Record<string, string> = {};
  try { for (const key of SYNC_KEYS) { const v = store.getItem(key); if (v !== null && v.length <= 4096) out[key] = v; } } catch { /* nothing to send */ }
  return out;
}
/** Makes this browser's settings match the save's; true when anything changed. A key the save lacks is removed. */
export function writeLocal(local: Record<string, string> | undefined, store: Store = localStorage): boolean {
  let changed = false;
  try {
    for (const key of SYNC_KEYS) {
      const next = typeof local?.[key] === 'string' ? local[key] : null, now = store.getItem(key);
      if (next === now) continue;
      if (next === null) store.removeItem(key); else store.setItem(key, next);
      changed = true;
    }
  } catch { /* storage full or blocked: the session is still taken over */ }
  return changed;
}
