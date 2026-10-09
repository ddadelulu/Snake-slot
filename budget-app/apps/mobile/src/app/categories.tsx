import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

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
  SettingsRow,
  TextField,
} from '@/components';
import { useCategories, useChangeCategory, type Category } from '@/data/categories';
import { categoryName } from '@/features/categories/categoryName';
import { CUSTOM_CATEGORY_MAX_LENGTH, validateCustomCategory } from '@/features/onboarding/draft';
import { categoryTestKey } from '@/features/transactions/labels';
import { goBackOr } from '@/lib/navigation';
import { makeStyles, useTheme } from '@/theme';

const useStyles = makeStyles((theme) => ({
  section: { gap: theme.spacing.sm },
  loading: { paddingVertical: theme.spacing.xxxl, alignItems: 'center' },
  sheet: { gap: theme.spacing.md },
}));

type NameProblem = 'required' | 'duplicate' | 'too_long';

/**
 * Categories (M4-07): add, rename, archive. Archived categories are kept so past purchases keep
 * their name; they leave budgets and quick add. Budgets themselves are set per category on its
 * detail screen.
 */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const categories = useCategories();
  const change = useChangeCategory();
  const [newName, setNewName] = useState('');
  const [newProblem, setNewProblem] = useState<NameProblem | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editProblem, setEditProblem] = useState<NameProblem | null>(null);
  const [failed, setFailed] = useState(false);

  const all = categories.data ?? [];
  const active = all.filter((category) => !category.archived);
  const archived = all.filter((category) => category.archived);

  const problemOf = (name: string, except: Category | null): NameProblem | null => {
    if (name.trim() === '') return 'required';
    const taken = active
      .filter((category) => category.id !== except?.id)
      .map((category) => categoryName(category, t));
    const code = validateCustomCategory(name, taken);
    return code === 'category_duplicate'
      ? 'duplicate'
      : code === 'category_too_long'
        ? 'too_long'
        : null;
  };

  const message = (problem: NameProblem | null) =>
    problem === 'required'
      ? t('editors.categories.nameRequired')
      : problem === 'duplicate'
        ? t('onboarding.categories.duplicate')
        : problem === 'too_long'
          ? t('onboarding.categories.tooLong')
          : undefined;

  const run = async (request: Parameters<typeof change.mutateAsync>[0]) => {
    setFailed(false);
    try {
      await change.mutateAsync(request);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };

  const add = async () => {
    const problem = problemOf(newName, null);
    setNewProblem(problem);
    if (problem) return;
    const sortOrder = Math.max(-1, ...all.map((category) => category.sortOrder)) + 1;
    if (await run({ kind: 'add', name: newName, sortOrder })) setNewName('');
  };

  const rename = async () => {
    if (!editing) return;
    const problem = problemOf(editName, editing);
    setEditProblem(problem);
    if (problem) return;
    if (await run({ kind: 'rename', id: editing.id, name: editName })) setEditing(null);
  };

  const archive = async () => {
    if (!editing) return;
    if (await run({ kind: 'archive', id: editing.id })) setEditing(null);
  };

  const errorBanner = failed ? (
    <AlertBanner tone="danger" message={t('editors.saveError')} testID="categories-error" />
  ) : null;

  return (
    <Screen scroll testID="categories-screen">
      <ScreenHeader backLabel={t('editors.back')} onBack={() => goBackOr('/settings')} />
      <AppText variant="title" accessibilityRole="header">
        {t('editors.categories.title')}
      </AppText>
      {editing ? null : errorBanner}

      {categories.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : categories.isError ? (
        <EmptyState
          title={t('editors.loadError')}
          message={t('transactions.loadErrorMessage')}
          actionLabel={t('transactions.retry')}
          onAction={() => void categories.refetch()}
          testID="categories-load-error"
        />
      ) : (
        <>
          <Card padded={false}>
            {active.map((category, index) => (
              <View key={category.id}>
                {index > 0 ? <Divider inset /> : null}
                <SettingsRow
                  label={categoryName(category, t)}
                  onPress={() => {
                    setFailed(false);
                    setEditProblem(null);
                    setEditName(categoryName(category, t));
                    setEditing(category);
                  }}
                  accessibilityHint={t('editors.categories.editHint')}
                  testID={`categories-item-${categoryTestKey(category)}`}
                />
              </View>
            ))}
          </Card>
          <View style={styles.section}>
            <TextField
              label={t('editors.categories.newLabel')}
              value={newName}
              onChangeText={(text) => {
                setNewName(text);
                setNewProblem(null);
              }}
              placeholder={t('onboarding.categories.customPlaceholder')}
              maxLength={CUSTOM_CATEGORY_MAX_LENGTH + 1}
              autoCapitalize="sentences"
              error={message(newProblem)}
              testID="categories-new-name"
            />
            <PrimaryButton
              variant="secondary"
              label={t('editors.categories.add')}
              onPress={() => void add()}
              loading={change.isPending && editing === null}
              testID="categories-add"
            />
          </View>
          {archived.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="heading" accessibilityRole="header">
                {t('editors.categories.archivedTitle')}
              </AppText>
              <Card padded={false}>
                {archived.map((category, index) => (
                  <View key={category.id}>
                    {index > 0 ? <Divider inset /> : null}
                    <SettingsRow
                      label={categoryName(category, t)}
                      testID={`categories-archived-${categoryTestKey(category)}`}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
        </>
      )}

      <BottomSheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing
            ? t('editors.categories.renameTitle', { name: categoryName(editing, t) })
            : undefined
        }
        closeLabel={t('common.close')}
        testID="categories-sheet"
      >
        <View style={styles.sheet}>
          {errorBanner}
          <TextField
            label={t('editors.categories.name')}
            value={editName}
            onChangeText={(text) => {
              setEditName(text);
              setEditProblem(null);
            }}
            maxLength={CUSTOM_CATEGORY_MAX_LENGTH + 1}
            error={message(editProblem)}
            testID="categories-rename-input"
          />
          <PrimaryButton
            label={t('editors.save')}
            onPress={() => void rename()}
            loading={change.isPending}
            testID="categories-rename-save"
          />
          <PrimaryButton
            variant="destructive"
            label={t('editors.categories.archive')}
            accessibilityHint={t('editors.categories.archiveHint')}
            onPress={() => void archive()}
            disabled={change.isPending}
            testID="categories-archive"
          />
          <AppText variant="caption" tone="secondary">
            {t('editors.categories.archiveHint')}
          </AppText>
        </View>
      </BottomSheet>
    </Screen>
  );
}
