import { lightTheme } from '@/theme';

import { momentIntensity } from './painLevel';

const motion = lightTheme.motion;
const options = { reduceMotion: false, soundEnabled: true };

describe('pain level', () => {
  it('Mild is short and silent, a tap confirms', () => {
    expect(momentIntensity('mild', motion, options)).toEqual({
      spinMs: motion.moment.spin.mild,
      walletItems: 2,
      animateWallet: true,
      tick: null,
      finalHit: null,
      errorBuzz: false,
      sound: false,
      holdMs: 0,
    });
  });

  it('Normal spins with ticks, a heavy hit and the coin sound', () => {
    const normal = momentIntensity('normal', motion, options);
    expect(normal).toMatchObject({ tick: 'light', finalHit: 'heavy', sound: true, holdMs: 0 });
    expect(normal.spinMs).toBe(motion.moment.spin.normal);
  });

  it('Brutal is the longest and strongest and must be held', () => {
    const brutal = momentIntensity('brutal', motion, options);
    const normal = momentIntensity('normal', motion, options);
    const mild = momentIntensity('mild', motion, options);
    expect(brutal).toMatchObject({ tick: 'medium', errorBuzz: true, holdMs: 2000 });
    expect(brutal.spinMs).toBeGreaterThan(normal.spinMs);
    expect(normal.spinMs).toBeGreaterThan(mild.spinMs);
    expect(brutal.walletItems).toBeGreaterThan(normal.walletItems);
  });

  it('follows the sound switch', () => {
    expect(momentIntensity('brutal', motion, { ...options, soundEnabled: false }).sound).toBe(
      false,
    );
  });

  it('Reduce Motion keeps the meaning and drops the movement', () => {
    const reduced = momentIntensity('brutal', motion, { ...options, reduceMotion: true });
    expect(reduced).toMatchObject({
      spinMs: 0,
      animateWallet: false,
      tick: null,
      finalHit: 'heavy',
      sound: true,
      holdMs: 2000,
    });
  });
});
