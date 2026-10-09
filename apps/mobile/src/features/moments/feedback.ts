import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { MomentIntensity } from './painLevel';

/**
 * Haptics and the coin sound of the payment moment. Feedback is decoration: a phone without a
 * vibration motor, the web build or a muted device must never break the moment, so every call
 * swallows its failure. The coin sound (assets/sounds/coin.wav) is a short clink synthesised
 * for this app from two decaying sine tones: no third-party audio.
 */

const native = Platform.OS === 'ios' || Platform.OS === 'android';

const quietly = (promise: Promise<unknown> | undefined) => {
  promise?.catch(() => undefined);
};

export function tick(intensity: MomentIntensity): void {
  if (!native || intensity.tick === null) return;
  quietly(
    intensity.tick === 'light'
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  );
}

export function finalHit(intensity: MomentIntensity, overBudget: boolean): void {
  if (!native) return;
  if (intensity.finalHit === 'heavy') {
    quietly(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }
  if (intensity.finalHit !== null && (intensity.errorBuzz || overBudget)) {
    quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  }
}

let coin: AudioPlayer | null = null;

export function playCoin(intensity: MomentIntensity): void {
  if (!intensity.sound) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    coin ??= createAudioPlayer(require('../../../assets/sounds/coin.wav'));
    coin.volume = intensity.errorBuzz ? 1 : 0.7;
    quietly(coin.seekTo(0));
    coin.play();
  } catch {
    // No audio output available: the moment works without the sound.
  }
}
