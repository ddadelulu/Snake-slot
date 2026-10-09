import { useEffect, useRef, useState } from 'react';

/**
 * Runs a spin of `durationMs` frame by frame and returns its progress (0…1). `onFrame` sees every
 * frame (haptic ticks), `onDone` fires once at the end. A duration of 0 (Reduce Motion) lands on
 * the end state at once. Changing `runKey` starts a new spin.
 */
export function useSpin(
  runKey: string,
  durationMs: number,
  onFrame: (progress: number) => void,
  onDone: () => void,
): number {
  const [state, setState] = useState({ key: runKey, progress: durationMs > 0 ? 0 : 1 });
  const callbacks = useRef({ onFrame, onDone });
  callbacks.current = { onFrame, onDone };

  useEffect(() => {
    let frame: number | null = null;
    let cancelled = false;
    if (durationMs <= 0) {
      setState({ key: runKey, progress: 1 });
      callbacks.current.onDone();
      return;
    }
    const started = Date.now();
    const step = () => {
      if (cancelled) return;
      const progress = Math.min(1, (Date.now() - started) / durationMs);
      setState({ key: runKey, progress });
      callbacks.current.onFrame(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
      else callbacks.current.onDone();
    };
    setState({ key: runKey, progress: 0 });
    frame = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [runKey, durationMs]);

  // A new purchase starts from its own beginning, even before the effect has run.
  return state.key === runKey ? state.progress : durationMs > 0 ? 0 : 1;
}
