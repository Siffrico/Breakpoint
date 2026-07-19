/**
 * Minimal FIFO promise concurrency limiter for promise-based fan-outs that
 * live outside an Effect pipeline (those use `{ concurrency: n }` directly).
 * At most `max` tasks run at once; the rest queue in submission order.
 */
export const createTaskLimiter = (max: number) => {
  let active = 0;
  const queue: (() => void)[] = [];

  const release = () => {
    active -= 1;
    queue.shift()?.();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active += 1;
        task().then(resolve, reject).finally(release);
      };
      if (active < max) run();
      else queue.push(run);
    });
};
