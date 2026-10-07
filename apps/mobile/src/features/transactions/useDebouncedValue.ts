import { useEffect, useState } from 'react';

/** Search waits this long after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 300;

/** `value`, but only after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
