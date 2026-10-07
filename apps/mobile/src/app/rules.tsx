import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import {
  AlertBanner,
  AppText,
  BottomSheet,
  Card,
  Divider,
  EmptyState,
  PrimaryButton,
  Screen,
  ScreenHeader,
} from '@/components';
import { useCategories } from '@/data/categories';
import { useDeleteRule, useRules, type CategorizationRule } from '@/data/rules';
import { categoryName } from '@/features/categories/categoryName';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  row: {
    minHeight: theme.sizes.rowHeight,
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  text: { flex: 1 },
  delete: {
    minHeight: theme.sizes.minTouchTarget,
    minWidth: theme.sizes.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  pressed: { opacity: theme.opacity.pressed },
  loading: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  sheet: { gap: theme.spacing.md },
}));

/**
 * Settings → Categorization rules (US-3.3): the "Always do this for …?" rules, e.g.
 * "Merchant contains “manor” → Clothes", each with a way to delete it. Rules are created by
 * answering that question when correcting a category, so the empty state says so.
 */
export default function RulesScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const rules = useRules();
  const categories = useCategories();
  const remove = useDeleteRule();
  // What the sheet is about; kept while the sheet slides out so its text stays complete.
  const [target, setTarget] = useState<CategorizationRule | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const describe = (rule: CategorizationRule) => {
    const category = categories.data?.find((candidate) => candidate.id === rule.categoryId);
    return t('rules.rule', {
      field: t(`rules.fields.${rule.matchField}`),
      type: t(`rules.types.${rule.matchType}`),
      pattern: rule.pattern,
      category: category ? categoryName(category, t) : t('rules.unknownCategory'),
    });
  };

  const openSheet = (rule: CategorizationRule) => {
    remove.reset();
    setSheetOpen(true);
    setTarget(rule);
  };

  const confirmDelete = () => {
    if (!target) return;
    remove.mutate(target.id, { onSuccess: () => setSheetOpen(false) });
  };

  const loading = rules.isPending || (categories.isPending && !categories.isError);

  return (
    <Screen scroll testID="rules-screen">
      <ScreenHeader
        backLabel={t('rules.back')}
        onBack={() => goBackOr('/settings')}
        testID="rules-header"
      />
      <AppText variant="title" accessibilityRole="header">
        {t('rules.title')}
      </AppText>
      {loading ? (
        <View
          style={styles.loading}
          accessible
          accessibilityLabel={t('rules.loading')}
          testID="rules-loading"
        >
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : rules.isError ? (
        <AlertBanner
          tone="danger"
          message={t('rules.loadError')}
          actionLabel={t('common.retry')}
          onAction={() => void rules.refetch()}
          testID="rules-error"
        />
      ) : rules.data.length === 0 ? (
        <EmptyState
          title={t('rules.emptyTitle')}
          message={t('rules.emptyMessage')}
          testID="rules-empty"
        />
      ) : (
        <>
          <AppText tone="secondary">{t('rules.message')}</AppText>
          <Card padded={false} testID="rules-list">
            {rules.data.map((rule, index) => {
              const text = describe(rule);
              return (
                <View key={rule.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <View style={styles.row}>
                    <AppText style={styles.text} testID={`rules-rule-${rule.id}`}>
                      {text}
                    </AppText>
                    <Pressable
                      onPress={() => openSheet(rule)}
                      accessibilityRole="button"
                      accessibilityLabel={t('rules.deleteLabel', { rule: text })}
                      style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
                      testID={`rules-delete-${rule.id}`}
                    >
                      <AppText variant="bodyStrong" tone="danger">
                        {t('rules.delete')}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('rules.sheet.title')}
        closeLabel={t('common.close')}
        testID="rules-delete-sheet"
      >
        <View style={styles.sheet}>
          {target ? <AppText variant="bodyStrong">{describe(target)}</AppText> : null}
          <AppText>{t('rules.sheet.message')}</AppText>
          {remove.isError ? (
            <AlertBanner
              tone="danger"
              message={t('rules.sheet.failed')}
              testID="rules-delete-error"
            />
          ) : null}
          <PrimaryButton
            label={t('rules.sheet.confirm')}
            onPress={confirmDelete}
            variant="destructive"
            loading={remove.isPending}
            testID="rules-delete-confirm"
          />
          <PrimaryButton
            label={t('rules.sheet.cancel')}
            onPress={() => setSheetOpen(false)}
            variant="secondary"
            testID="rules-delete-cancel"
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
