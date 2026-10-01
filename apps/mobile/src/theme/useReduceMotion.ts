import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True while the operating system's Reduce Motion setting is on (iOS "Reduce Motion", Android
 * "Remove animations"). Animations must then jump to their end state instead of moving.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        // Unknown means animate: the platform default.
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
