import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useReduceMotion, useTheme } from '@/theme';

import { AppText } from './AppText';

export type BottomSheetProps = {
  visible: boolean;
  /** Called for the close button, a tap on the dimmed backdrop, Android back and the iOS escape gesture. */
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Translated label of the close button, e.g. "Close" / "Schliessen". */
  closeLabel: string;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.scrim,
  },
  scrimPressable: { flex: 1 },
  keyboard: { width: '100%', maxHeight: '90%' },
  panel: {
    // Shrinks to the 90 % limit above, so a long list inside can scroll instead of overflowing.
    flexShrink: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderColor: theme.colors.border,
    borderWidth: theme.borderWidths.thin,
    borderBottomWidth: 0,
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: theme.sizes.maxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    minHeight: theme.sizes.minTouchTarget,
  },
  title: { flex: 1 },
  close: {
    minWidth: theme.sizes.minTouchTarget,
    minHeight: theme.sizes.minTouchTarget,
    paddingHorizontal: theme.spacing.sm,
    marginEnd: -theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
  },
  closePressed: { backgroundColor: theme.colors.surfaceMuted },
}));

/**
 * A panel that slides up from the bottom over a dimmed screen. With Reduce Motion on it appears
 * and disappears without movement.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  closeLabel,
  testID,
}: BottomSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  // 0 = hidden below the screen, 1 = fully shown.
  const [progress] = useState(() => new Animated.Value(0));
  // Stays true while the closing animation runs, so the sheet can slide out before unmounting.
  const [mounted, setMounted] = useState(visible);

  if (visible && !mounted) setMounted(true);
  if (!visible && mounted && reduceMotion) setMounted(false);

  const { sheetEnter, sheetExit } = theme.motion;

  useEffect(() => {
    if (!visible && !mounted) {
      // Fully closed: park below the screen so the next opening slides in from the bottom.
      progress.setValue(0);
      return;
    }
    const toValue = visible ? 1 : 0;
    if (reduceMotion) {
      progress.setValue(toValue);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue,
      duration: visible ? sheetEnter : sheetExit,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, mounted, reduceMotion, progress, sheetEnter, sheetExit]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });
  // With Reduce Motion the sheet is only mounted while visible, so the scrim is simply shown.
  const scrimOpacity = reduceMotion ? 1 : progress;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      testID={testID}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
          <Pressable
            onPress={onClose}
            style={styles.scrimPressable}
            accessible={false}
            importantForAccessibility="no"
            testID={testID === undefined ? undefined : `${testID}-scrim`}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
          style={styles.keyboard}
        >
          <Animated.View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            testID={testID === undefined ? undefined : `${testID}-panel`}
            style={[
              styles.panel,
              { paddingBottom: insets.bottom + theme.spacing.xl },
              reduceMotion ? null : { transform: [{ translateY }] },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.title}>
                {title ? (
                  <AppText variant="heading" accessibilityRole="header">
                    {title}
                  </AppText>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                testID={testID === undefined ? undefined : `${testID}-close`}
                style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
              >
                <AppText variant="bodyStrong" tone="accent">
                  {closeLabel}
                </AppText>
              </Pressable>
            </View>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
