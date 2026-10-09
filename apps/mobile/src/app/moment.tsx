import { formatChf, minutesOfWork, type PainLevel } from '@budget/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  Card,
  Divider,
  EmptyState,
  PrimaryButton,
  Screen,
  TextLink,
  TransactionRow,
} from '@/components';
import { useCategories, type Category } from '@/data/categories';
import { useAcknowledgeTransactions, usePendingMoments, type Moment } from '@/data/moments';
import { useProfile } from '@/data/profile';
import { categoryName } from '@/features/categories/categoryName';
import { ConfirmButton } from '@/features/moments/ConfirmButton';
import { DrainBar } from '@/features/moments/DrainBar';
import { finalHit, playCoin, tick } from '@/features/moments/feedback';
import { Odometer } from '@/features/moments/Odometer';
import { francChanged, spinValue } from '@/features/moments/odometer';
import { momentIntensity, type MomentIntensity } from '@/features/moments/painLevel';
import { useSpin } from '@/features/moments/useSpin';
import { Wallet } from '@/features/moments/Wallet';
import { useLanguage } from '@/i18n';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useReduceMotion, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  root: { flex: 1 },
  center: { alignItems: 'center', gap: theme.spacing.xs },
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.statusDanger },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));

/** "= 2.5 hours of work" or "= 45 minutes of work"; null without income and hours. */
function workText(
  moment: Moment,
  income: { netIncomeRappen: number | null; weeklyWorkMinutes: number | null },
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  const minutes = minutesOfWork(moment.amountRappen, income);
  if (minutes === null) return null;
  if (minutes < 60) return t('moment.minutesOfWork', { count: Math.max(1, minutes) });
  return t('moment.hoursOfWork', { hours: String(Math.round(minutes / 6) / 10) });
}

/**
 * The cash-feel payment moment (spec section 8): every purchase the person has not confirmed yet,
 * one at a time, oldest first. The balance rolls down like an odometer, money leaves a wallet, the
 * category bar drains, the phone hits; "I paid this" closes it. Opened on app start and return,
 * after quick add, and from a push (`/moment?transaction=<id>`, which shows that purchase first).
 */
export default function MomentScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { transaction } = useLocalSearchParams<{ transaction?: string }>();
  const pending = usePendingMoments();
  const acknowledge = useAcknowledgeTransactions();
  const [queue, setQueue] = useState<Moment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [failed, setFailed] = useState(false);

  // The queue is taken once: confirming one must not reshuffle what is on screen.
  useEffect(() => {
    if (queue !== null || !pending.data) return;
    const wanted = pending.data.find((moment) => moment.id === transaction);
    if (transaction && !wanted) {
      // Already confirmed (or not a purchase): the push still leads to the transaction.
      router.replace({ pathname: '/transaction/[id]', params: { id: transaction } });
      return;
    }
    const ordered = wanted
      ? [wanted, ...pending.data.filter((moment) => moment.id !== wanted.id)]
      : pending.data;
    setQueue(ordered);
    setTotal(ordered.length);
  }, [pending.data, queue, transaction]);

  const close = () => goBackOr('/');

  const confirm = async (ids: string[]) => {
    setFailed(false);
    try {
      await acknowledge.mutateAsync(ids);
    } catch {
      setFailed(true);
      return;
    }
    const rest = (queue ?? []).filter((moment) => !ids.includes(moment.id));
    setQueue(rest);
    setShowAll(false);
    if (rest.length === 0) close();
  };

  const errorBanner = failed ? (
    <AlertBanner tone="danger" message={t('moment.confirmError')} testID="moment-error" />
  ) : null;

  if (pending.isError) {
    return (
      <Screen testID="moment-screen">
        <EmptyState
          title={t('moment.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void pending.refetch()}
          testID="moment-load-error"
        />
        <TextLink label={t('moment.later')} onPress={close} testID="moment-later" />
      </Screen>
    );
  }

  if (queue === null) {
    return (
      <Screen testID="moment-screen">
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} accessibilityLabel={t('moment.loading')} />
        </View>
      </Screen>
    );
  }

  const current = queue[0];
  if (!current) {
    return (
      <Screen
        footer={<PrimaryButton label={t('moment.done')} onPress={close} testID="moment-done" />}
        testID="moment-screen"
      >
        <EmptyState
          title={t('moment.nothingTitle')}
          message={t('moment.nothingMessage')}
          testID="moment-nothing"
        />
      </Screen>
    );
  }

  if (showAll) {
    return (
      <Summary
        queue={queue}
        onConfirm={() => void confirm(queue.map((moment) => moment.id))}
        onBack={() => setShowAll(false)}
        loading={acknowledge.isPending}
        errorBanner={errorBanner}
      />
    );
  }

  return (
    <MomentView
      key={current.id}
      moment={current}
      position={total - queue.length + 1}
      total={total}
      remaining={queue.length}
      onShowAll={() => setShowAll(true)}
      onConfirm={() => void confirm([current.id])}
      loading={acknowledge.isPending}
      errorBanner={errorBanner}
    />
  );
}

function usePain(): { intensity: MomentIntensity; level: PainLevel } {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { data: profile } = useProfile();
  const level = profile?.pain_level ?? 'normal';
  return {
    level,
    intensity: momentIntensity(level, theme.motion, {
      reduceMotion,
      soundEnabled: profile?.sound_enabled ?? true,
    }),
  };
}

function nameOf(
  moment: Moment,
  categories: Category[] | undefined,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const category = categories?.find((entry) => entry.id === moment.categoryId);
  return category ? categoryName(category, t) : null;
}

type MomentViewProps = {
  moment: Moment;
  position: number;
  total: number;
  remaining: number;
  onShowAll: () => void;
  onConfirm: () => void;
  loading: boolean;
  errorBanner: ReactNode;
};

function MomentView({
  moment,
  position,
  total,
  remaining,
  onShowAll,
  onConfirm,
  loading,
  errorBanner,
}: MomentViewProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const { data: profile } = useProfile();
  const categories = useCategories();
  const { intensity } = usePain();
  const [landed, setLanded] = useState(false);
  const [flash] = useState(() => new Animated.Value(0));
  const lastFrame = useRef({ value: moment.balanceBeforeRappen, at: 0 });
  const hit = useRef(false);

  const progress = useSpin(
    moment.id,
    intensity.spinMs,
    (frame) => {
      const value = spinValue(moment.balanceBeforeRappen, moment.balanceAfterRappen, frame);
      const now = Date.now();
      if (
        francChanged(lastFrame.current.value, value) &&
        now - lastFrame.current.at >= theme.motion.moment.tickInterval
      ) {
        tick(intensity);
        lastFrame.current = { value, at: now };
      }
    },
    () => {
      setLanded(true);
      if (hit.current) return;
      hit.current = true;
      finalHit(intensity, moment.overBudget);
      playCoin(intensity);
      if (moment.overBudget && intensity.spinMs > 0) {
        Animated.sequence([
          Animated.timing(flash, {
            toValue: 0.35,
            duration: theme.motion.moment.flash / 3,
            useNativeDriver: true,
          }),
          Animated.timing(flash, {
            toValue: 0,
            duration: (theme.motion.moment.flash * 2) / 3,
            useNativeDriver: true,
          }),
        ]).start();
      }
    },
  );

  const value = spinValue(moment.balanceBeforeRappen, moment.balanceAfterRappen, progress);
  const name = nameOf(moment, categories.data, t);
  const merchant = moment.merchant ?? moment.note ?? name ?? t('moment.unknownMerchant');
  const work = workText(
    moment,
    {
      netIncomeRappen: profile?.net_income_rappen ?? null,
      weeklyWorkMinutes: profile?.weekly_work_minutes ?? null,
    },
    t,
  );
  const balanceText = formatChf(moment.balanceAfterRappen, { language });
  const hasBar = moment.budgetRappen !== null && moment.remainingAfterRappen !== null;
  const remainingAfter = moment.remainingAfterRappen ?? 0;
  const categoryLine =
    name === null
      ? t('moment.noCategory')
      : !hasBar
        ? name
        : remainingAfter < 0
          ? t('moment.categoryOver', {
              name,
              amount: formatChf(-remainingAfter, { language }),
            })
          : t('moment.categoryLeft', { name, amount: formatChf(remainingAfter, { language }) });

  return (
    <View style={styles.root}>
      <Screen
        scroll
        footer={
          <>
            {errorBanner}
            <ConfirmButton
              label={intensity.holdMs > 0 ? t('moment.hold') : t('moment.confirm')}
              holdMs={intensity.holdMs}
              onConfirm={onConfirm}
              loading={loading}
              accessibilityHint={
                intensity.holdMs > 0 ? t('moment.holdHint') : t('moment.confirmHint')
              }
              testID="moment-confirm"
            />
          </>
        }
        testID="moment-screen"
      >
        {total > 1 ? (
          <View style={styles.topRow}>
            <AppText tone="secondary" testID="moment-position">
              {t('moment.position', { current: position, total })}
            </AppText>
            {remaining > 1 ? (
              <TextLink
                label={t('moment.showAll', { count: remaining })}
                onPress={onShowAll}
                testID="moment-show-all"
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.center}>
          <AppText tone="secondary">{t('moment.title')}</AppText>
          <AppText variant="heading" align="center" accessibilityRole="header" testID="moment-merchant">
            {merchant}
          </AppText>
          <AppText variant="title" numeric testID="moment-amount">
            {formatChf(moment.amountRappen, { language })}
          </AppText>
        </View>

        <Wallet
          items={intensity.walletItems}
          animate={intensity.animateWallet}
          runKey={moment.id}
          testID="moment-wallet"
        />

        <View style={styles.center}>
          <Odometer
            from={moment.balanceBeforeRappen}
            to={moment.balanceAfterRappen}
            value={value}
            language={language}
            tone={moment.balanceAfterRappen < 0 && landed ? 'danger' : 'primary'}
            accessibilityLabel={t('moment.balanceSpoken', { amount: balanceText })}
            testID="moment-balance"
          />
          <AppText tone="secondary">{t('moment.balanceLabel')}</AppText>
          {work ? (
            <AppText variant="bodyStrong" testID="moment-work">
              {work}
            </AppText>
          ) : null}
        </View>

        <View style={styles.section}>
          <AppText testID="moment-category">{categoryLine}</AppText>
          {hasBar ? (
            <DrainBar
              budget={moment.budgetRappen ?? 0}
              before={moment.remainingBeforeRappen ?? remainingAfter}
              after={remainingAfter}
              durationMs={intensity.spinMs}
              runKey={moment.id}
              accessibilityLabel={categoryLine}
              testID="moment-category-bar"
            />
          ) : null}
        </View>

        {moment.overBudget && landed ? (
          <AlertBanner
            tone="danger"
            title={t('moment.overBudgetTitle')}
            message={name ? t('moment.overBudgetCategory', { name }) : t('moment.overBudget')}
            testID="moment-over-budget"
          />
        ) : null}
      </Screen>
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flash }]}
        testID="moment-flash"
      />
    </View>
  );
}

function Summary({
  queue,
  onConfirm,
  onBack,
  loading,
  errorBanner,
}: {
  queue: Moment[];
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
  errorBanner: ReactNode;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { language } = useLanguage();
  const categories = useCategories();
  const { intensity } = usePain();
  const sum = queue.reduce((total, moment) => total + moment.amountRappen, 0);
  const last = queue[queue.length - 1];

  return (
    <Screen
      scroll
      footer={
        <>
          {errorBanner}
          <ConfirmButton
            label={intensity.holdMs > 0 ? t('moment.holdAll') : t('moment.confirmAll')}
            holdMs={intensity.holdMs}
            onConfirm={onConfirm}
            loading={loading}
            accessibilityHint={intensity.holdMs > 0 ? t('moment.holdHint') : t('moment.confirmHint')}
            testID="moment-confirm-all"
          />
        </>
      }
      testID="moment-summary"
    >
      <AppText variant="title" accessibilityRole="header">
        {t('moment.summaryTitle', { count: queue.length })}
      </AppText>
      <Card padded={false}>
        {queue.map((moment, index) => {
          const name = nameOf(moment, categories.data, t);
          return (
            <View key={moment.id}>
              {index > 0 ? <Divider inset /> : null}
              <TransactionRow
                merchant={moment.merchant ?? moment.note ?? name ?? t('moment.unknownMerchant')}
                amount={moment.amountRappen}
                language={language}
                subtitle={name ?? t('moment.noCategory')}
                testID={`moment-summary-${index}`}
              />
            </View>
          );
        })}
      </Card>
      <View style={styles.section}>
        <AppText variant="bodyStrong" testID="moment-summary-total">
          {t('moment.summaryTotal', { amount: formatChf(sum, { language }) })}
        </AppText>
        {last ? (
          <AppText tone={last.balanceAfterRappen < 0 ? 'danger' : 'secondary'}>
            {t('moment.summaryBalance', {
              amount: formatChf(last.balanceAfterRappen, { language }),
            })}
          </AppText>
        ) : null}
        {queue.some((moment) => moment.overBudget) ? (
          <AppText tone="danger" testID="moment-summary-over">
            {t('moment.overBudget')}
          </AppText>
        ) : null}
      </View>
      <TextLink label={t('moment.oneAtATime')} onPress={onBack} testID="moment-one-at-a-time" />
    </Screen>
  );
}
