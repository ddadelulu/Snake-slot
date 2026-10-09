import type { PainLevel } from '@budget/core';

import type { Motion } from '@/theme';

/**
 * How hard the payment moment hits, per pain level (spec section 8, M4-02):
 * - mild: a short count-down, no vibration, no sound, a tap closes it;
 * - normal: the full spin with haptic ticks, a heavy hit at the end and the coin sound;
 * - brutal: the longest spin, stronger ticks, an extra error buzz, more money leaving the wallet,
 *   and "I paid this" must be held for two seconds.
 * Reduce Motion keeps the meaning (end state, final hit, sound) and drops every movement.
 */
export type MomentIntensity = {
  spinMs: number;
  /** Bills and coins leaving the wallet. */
  walletItems: number;
  animateWallet: boolean;
  tick: 'light' | 'medium' | null;
  finalHit: 'heavy' | null;
  /** An extra error buzz after the hit (Brutal). */
  errorBuzz: boolean;
  sound: boolean;
  /** 0: a tap confirms. */
  holdMs: number;
};

export function momentIntensity(
  level: PainLevel,
  motion: Motion,
  options: { reduceMotion: boolean; soundEnabled: boolean },
): MomentIntensity {
  const { reduceMotion, soundEnabled } = options;
  const spin = motion.moment.spin[level];
  const base: MomentIntensity =
    level === 'mild'
      ? {
          spinMs: spin,
          walletItems: 2,
          animateWallet: true,
          tick: null,
          finalHit: null,
          errorBuzz: false,
          sound: false,
          holdMs: 0,
        }
      : level === 'normal'
        ? {
            spinMs: spin,
            walletItems: 4,
            animateWallet: true,
            tick: 'light',
            finalHit: 'heavy',
            errorBuzz: false,
            sound: soundEnabled,
            holdMs: 0,
          }
        : {
            spinMs: spin,
            walletItems: 7,
            animateWallet: true,
            tick: 'medium',
            finalHit: 'heavy',
            errorBuzz: true,
            sound: soundEnabled,
            holdMs: motion.moment.holdToConfirm,
          };
  return reduceMotion ? { ...base, spinMs: 0, animateWallet: false, tick: null } : base;
}
