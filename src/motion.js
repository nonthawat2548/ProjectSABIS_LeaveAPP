export const ENTRY_TIMING = { checking: 650, ready: 320, leaving: 240, menuClose: 180 };

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/** Presentation timing only; authentication and data loading always run immediately. */
export function motionDelay(duration, signal) {
  if (signal.aborted) return Promise.resolve(false);
  if (!duration || prefersReducedMotion()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (completed) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(completed);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), duration);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
