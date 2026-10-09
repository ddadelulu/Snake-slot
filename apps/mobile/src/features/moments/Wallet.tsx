import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  stage: {
    alignSelf: 'center',
    width: theme.sizes.wallet.width + theme.sizes.walletTravel,
    height: theme.sizes.wallet.height + theme.sizes.walletTravel,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  wallet: {
    width: theme.sizes.wallet.width,
    height: theme.sizes.wallet.height,
    borderRadius: theme.radii.lg,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceMuted,
  },
  flap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: theme.sizes.wallet.flapHeight,
    borderBottomWidth: theme.borderWidths.thick,
    borderColor: theme.colors.borderStrong,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  item: {
    position: 'absolute',
    bottom: theme.sizes.wallet.height - theme.sizes.wallet.flapHeight,
  },
  bill: {
    width: theme.sizes.bill.width,
    height: theme.sizes.bill.height,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.statusOk,
    backgroundColor: theme.colors.statusOkSurface,
  },
  coin: {
    width: theme.sizes.coin,
    height: theme.sizes.coin,
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.thick,
    borderColor: theme.colors.statusWarning,
    backgroundColor: theme.colors.statusWarningSurface,
  },
}));

export type WalletProps = {
  /** Bills and coins that leave; every third one is a coin. */
  items: number;
  /** False: everything is already out (Reduce Motion). */
  animate: boolean;
  /** Changes for every new purchase, restarting the animation. */
  runKey: string;
  testID?: string;
};

/**
 * A plain wallet with money sliding out of it (spec section 8). Drawn from boxes in token colours,
 * no artwork and no branding; decorative, so screen readers skip it.
 */
export function Wallet({ items, animate, runKey, testID }: WalletProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [values] = useState(() => Array.from({ length: 8 }, () => new Animated.Value(0)));

  useEffect(() => {
    const used = values.slice(0, items);
    if (!animate) {
      for (const value of used) value.setValue(1);
      return;
    }
    for (const value of used) value.setValue(0);
    const animation = Animated.stagger(
      theme.motion.moment.walletStagger,
      used.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: theme.motion.moment.walletOut,
          useNativeDriver: true,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [animate, items, runKey, values, theme]);

  const travel = theme.sizes.walletTravel;
  const spread = theme.sizes.wallet.width / 2;

  return (
    <View
      style={styles.stage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {values.slice(0, items).map((value, index) => {
        const coin = index % 3 === 2;
        // Fan out left and right of the middle, the later ones higher.
        const side = index % 2 === 0 ? -1 : 1;
        const x = side * spread * (((index % 4) + 1) / 4) * 0.8;
        const y = travel * (0.55 + (index % 3) * 0.2);
        return (
          <Animated.View
            key={index}
            style={[
              styles.item,
              coin ? styles.coin : styles.bill,
              {
                opacity: value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
                  { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -y] }) },
                  {
                    rotate: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${side * (8 + index * 3)}deg`],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
      <View style={styles.wallet}>
        <View style={styles.flap} />
      </View>
    </View>
  );
}
