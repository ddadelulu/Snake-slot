import { useEffect, useRef, useState } from 'react';

/**
 * Runs a spin of `durationMs` frame by frame and returns its progress (0…1). `onFrame` sees every
 * frame (haptic ticks), `onDone` fires at the end. A duration of 0 (Reduce Motion) lands on the
 * end state at once. Changing `runKey` starts a new spin.
 */
export function useSpin(
  runKey: string,
  durationMs: number,
  onFrame: (progress: number) => void,
  onDone: () => void,
): number {
  const [frame, setFrame] = useState<{ key: string; progress: number } | null>(null);
  const callbacks = useRef({ onFrame, onDone });

  useEffect(() => {
    callbacks.current = { onFrame, onDone };
  });

  useEffect(() => {
    if (durationMs <= 0) {
      callbacks.current.onDone();
      return;
    }
    let request = 0;
    let cancelled = false;
    const started = Date.now();
    const step = () => {
      if (cancelled) return;
      const progress = Math.min(1, (Date.now() - started) / durationMs);
      setFrame({ key: runKey, progress });
      callbacks.current.onFrame(progress);
      if (progress < 1) request = requestAnimationFrame(step);
      else callbacks.current.onDone();
    };
    request = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(request);
    };
  }, [runKey, durationMs]);

  if (durationMs <= 0) return 1;
  // A new purchase starts from its own beginning, before its first frame has run.
  return frame?.key === runKey ? frame.progress : 0;
}
