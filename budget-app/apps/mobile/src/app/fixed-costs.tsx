import { FIXED_COST_KINDS, formatChf, type FixedCostKind } from '@budget/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import {
  AlertBanner,
  AmountInput,
  AppText,
  BottomSheet,
  Card,
  ChoiceList,
  Divider,
  EmptyState,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SettingsRow,
  TextField,
} from '@/components';
import { useChangeFixedCost, useFixedCosts, type FixedCost } from '@/data/fixedCosts';
import { parseAmountInput, rappenToInput } from '@/features/transactions/amount';
import { fixedCostName } from '@/features/transactions/labels';
import { useLanguage } from '@/i18n';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  sheet: { gap: theme.spacing.md },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
}));

/** Editing: a new one (`id` null) or an existing one. */
type Draft = { id: string | null; kind: FixedCostKind; label: string; amount: string };

const LABEL_MAX_LENGTH = 80;

/**
 * Fixed costs (M4-07): add, change, stop. Stopped ones are kept (never deleted) so their past
 * payments stay linked; every change counts from the next month.
 */
export default function FixedCostsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const { language } = useLanguage();
  const fixedCosts = useFixedCosts();
  const change = useChangeFixedCost();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [failed, setFailed] = useState(false);

  const active = (fixedCosts.data ?? []).filter((cost) => cost.active);
  const stopped = (fixedCosts.data ?? []).filter((cost) => !cost.active);
  const amount = draft ? parseAmountInput(draft.amount) : null;

  const edit = (next: Draft) => {
    setSubmitted(false);
    setFailed(false);
    setDraft(next);
  };

  const run = async (request: Parameters<typeof change.mutateAsync>[0]) => {
    setFailed(false);
    try {
      await change.mutateAsync(request);
      setDraft(null);
    } catch {
      setFailed(true);
    }
  };

  const save = () => {
    setSubmitted(true);
    if (!draft || !amount?.ok) return;
    const fields = { kind: draft.kind, label: draft.label, amountRappen: amount.rappen };
    void run(
      draft.id === null ? { action: 'add', fields } : { action: 'edit', id: draft.id, fields },
    );
  };

  const row = (cost: FixedCost, index: number, list: 'active' | 'stopped') => (
    <View key={cost.id}>
      {index > 0 ? <Divider inset /> : null}
      <SettingsRow
        label={fixedCostName(cost, t)}
        value={formatChf(cost.amountRappen, { language })}
        onPress={
          list === 'active'
            ? () =>
                edit({
                  id: cost.id,
                  kind: cost.kind,
                  label: cost.label ?? '',
                  amount: rappenToInput(cost.amountRappen),
                })
            : undefined
        }
        accessibilityHint={list === 'active' ? t('editors.fixedCosts.editHint') : undefined}
        testID={`fixed-costs-${list}-${index}`}
      />
    </View>
  );

  return (
    <Screen scroll testID="fixed-costs-screen">
      <ScreenHeader backLabel={t('editors.back')} onBack={() => goBackOr('/settings')} />
      <AppText variant="title" accessibilityRole="header">
        {t('editors.fixedCosts.title')}
      </AppText>
      <AlertBanner tone="info" message={t('editors.nextMonth')} />

      {fixedCosts.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : fixedCosts.isError ? (
        <EmptyState
          title={t('editors.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void fixedCosts.refetch()}
          testID="fixed-costs-load-error"
        />
      ) : (
        <>
          <View style={styles.section}>
            {active.length === 0 ? (
              <AppText tone="secondary" testID="fixed-costs-empty">
                {t('editors.fixedCosts.empty')}
              </AppText>
            ) : (
              <>
                <Card padded={false}>
                  {active.map((cost, index) => row(cost, index, 'active'))}
                </Card>
                <AppText tone="secondary" testID="fixed-costs-total">
                  {t('onboarding.fixedCosts.total', {
                    amount: formatChf(
                      active.reduce((sum, cost) => sum + cost.amountRappen, 0),
                      { language },
                    ),
                  })}
                </AppText>
              </>
            )}
            <PrimaryButton
              variant="secondary"
              label={t('editors.fixedCosts.add')}
              onPress={() => edit({ id: null, kind: 'rent', label: '', amount: '' })}
              testID="fixed-costs-add"
            />
          </View>
          {stopped.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="heading" accessibilityRole="header">
                {t('editors.fixedCosts.stoppedTitle')}
              </AppText>
              <Card padded={false}>
                {stopped.map((cost, index) => row(cost, index, 'stopped'))}
              </Card>
            </View>
          ) : null}
        </>
      )}

      <BottomSheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={
          draft?.id === null ? t('editors.fixedCosts.addTitle') : t('editors.fixedCosts.editTitle')
        }
        closeLabel={t('common.close')}
        testID="fixed-costs-sheet"
      >
        {draft ? (
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheet}>
            {failed ? (
              <AlertBanner
                tone="danger"
                message={t('editors.saveError')}
                testID="fixed-costs-error"
              />
            ) : null}
            <AmountInput
              label={t('editors.fixedCosts.amount')}
              currency="CHF"
              value={draft.amount}
              onChangeText={(text) => setDraft({ ...draft, amount: text })}
              error={
                submitted && amount && !amount.ok
                  ? amount.problem === 'required'
                    ? t('editors.fixedCosts.amountRequired')
                    : t('onboarding.amountInvalid')
                  : undefined
              }
              testID="fixed-costs-amount"
            />
            <TextField
              label={t('editors.fixedCosts.label')}
              value={draft.label}
              onChangeText={(label) => setDraft({ ...draft, label })}
              maxLength={LABEL_MAX_LENGTH}
              testID="fixed-costs-label"
            />
            <AppText variant="label">{t('editors.fixedCosts.kind')}</AppText>
            <ChoiceList<FixedCostKind>
              options={FIXED_COST_KINDS.map((kind) => ({
                value: kind,
                label: t(`fixedCostKinds.${kind}`),
              }))}
              selected={draft.kind}
              onSelect={(kind) => setDraft({ ...draft, kind })}
              accessibilityLabel={t('editors.fixedCosts.kind')}
              testID="fixed-costs-kind"
            />
            <PrimaryButton
              label={t('editors.save')}
              onPress={save}
              loading={change.isPending}
              testID="fixed-costs-save"
            />
            {draft.id !== null ? (
              <>
                <PrimaryButton
                  variant="destructive"
                  label={t('editors.fixedCosts.stop')}
                  accessibilityHint={t('editors.fixedCosts.stopHint')}
                  onPress={() => {
                    if (draft.id !== null) void run({ action: 'stop', id: draft.id });
                  }}
                  disabled={change.isPending}
                  testID="fixed-costs-stop"
                />
                <AppText variant="caption" tone="secondary">
                  {t('editors.fixedCosts.stopHint')}
                </AppText>
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
