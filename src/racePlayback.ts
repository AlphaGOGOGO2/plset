type PlaybackFrame = { now: number; moving: boolean; finished: boolean; progress: number[]; finish: number; arrived: number; speed: number };

// Presentation time only: fixed-step physics and finish order stay unchanged.
export function createFinishSlowMotion() {
  let startedAt: number | null = null, used = false;
  return {
    update({ now, moving, finished, progress, finish, arrived, speed }: PlaybackFrame) {
      const closeFinish = moving && !finished && progress.length === 2
        && finish - Math.min(...progress) <= 22 && Math.abs(progress[0] - progress[1]) <= 4;
      if (closeFinish && !used) { used = true; startedAt = now; }
      if (startedAt !== null && (!closeFinish || now - startedAt >= 2500)) startedAt = null;
      const slow = startedAt !== null;
      // After the close finish, restore the user's speed instead of jumping
      // straight into the usual cleanup acceleration for the remaining marble.
      const normalScale = !moving || finished || (used && progress.length <= 2) ? 1
        : progress.length <= 1 ? 3 : arrived > 0 ? 2 : 1;
      return { slow, scale: slow ? .65 / speed : normalScale };
    },
  };
}
