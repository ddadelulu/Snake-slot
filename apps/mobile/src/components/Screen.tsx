import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme';

import { AppText } from './AppText';

export type ScreenEdge = 'top' | 'right' | 'bottom' | 'left';

const ALL_EDGES: readonly ScreenEdge[] = ['top', 'right', 'bottom', 'left'];

export type ScreenProps = {
  children: ReactNode;
  /** Large page heading, announced as a header. */
  title?: string;
  /** Scroll the content (forms, long lists built from rows). */
  scroll?: boolean;
  /** Content pinned under the scroll area, e.g. the main button of a form. */
  footer?: ReactNode;
  /**
   * Safe-area edges this screen pads itself. Drop 'top' when a navigation header already
   * covers the status bar.
   */
  edges?: readonly ScreenEdge[];
  /** Height of a navigation header above the screen, so iOS keyboard avoidance lines up. */
  keyboardVerticalOffset?: number;
  testID?: string;
};

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: theme.sizes.maxContentWidth,
    alignSelf: 'center',
    gap: theme.layout.sectionGap,
  },
  footer: {
    width: '100%',
    maxWidth: theme.sizes.maxContentWidth,
    alignSelf: 'center',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
}));

/**
 * The page container every screen starts with: theme background, safe-area and token padding,
 * optional title and scrolling, and on iOS it moves content out of the keyboard's way.
 */
export function Screen({
  children,
  title,
  scroll = false,
  footer,
  edges = ALL_EDGES,
  keyboardVerticalOffset = 0,
  testID,
}: ScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const gutter = theme.layout.screenPadding;
  const inset = (edge: ScreenEdge) => (edges.includes(edge) ? insets[edge] : 0);
  const hasFooter = footer !== undefined && footer !== null;

  const horizontal = { paddingLeft: gutter + inset('left'), paddingRight: gutter + inset('right') };
  const contentPadding = {
    ...horizontal,
    paddingTop: gutter + inset('top'),
    paddingBottom: hasFooter ? gutter : gutter + inset('bottom'),
  };
  const footerPadding = { ...horizontal, paddingBottom: gutter + inset('bottom') };

  const body = (
    <>
      {title ? (
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </>
  );

  return (
    <View testID={testID} style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.flex}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, contentPadding]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            testID={testID === undefined ? undefined : `${testID}-scroll`}
          >
            {body}
          </ScrollView>
        ) : (
          <View
            testID={testID === undefined ? undefined : `${testID}-content`}
            style={[styles.flex, styles.content, contentPadding]}
          >
            {body}
          </View>
        )}
        {hasFooter ? (
          <View
            testID={testID === undefined ? undefined : `${testID}-footer`}
            style={[styles.footer, footerPadding]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
