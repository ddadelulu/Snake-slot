import { act, renderHook } from '@testing-library/react-native';

import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('follows the value only after it has stopped changing', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: '' },
    });
    rerender({ value: 'm' });
    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    rerender({ value: 'ma' });
    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    expect(result.current).toBe('');
    act(() => jest.advanceTimersByTime(50));
    expect(result.current).toBe('ma');
  });
});
