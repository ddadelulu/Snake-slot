import { renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setAfterOnboarding, takeAfterOnboarding, useAfterOnboarding } from './afterOnboarding';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  setAfterOnboarding(null);
});

describe('after onboarding', () => {
  it('hands out the destination once', () => {
    setAfterOnboarding('/import?from=onboarding');
    expect(takeAfterOnboarding()).toBe('/import?from=onboarding');
    expect(takeAfterOnboarding()).toBeNull();
  });

  it('opens the destination when the person becomes onboarded, not before', () => {
    setAfterOnboarding('/import?from=onboarding');
    const { rerender } = renderHook(
      ({ onboarded }: { onboarded: boolean }) => useAfterOnboarding(onboarded),
      {
        initialProps: { onboarded: false },
      },
    );
    expect(router.push).not.toHaveBeenCalled();
    rerender({ onboarded: true });
    expect(router.push).toHaveBeenCalledWith('/import?from=onboarding');
    rerender({ onboarded: false });
    rerender({ onboarded: true });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('does nothing for someone who was already onboarded', () => {
    renderHook(() => useAfterOnboarding(true));
    expect(router.push).not.toHaveBeenCalled();
  });
});
