import { BASE_CURRENCY, formatChf, type Rappen } from '@budget/core';
import { useTranslation } from 'react-i18next';

import { SplitEditor } from '@/components';
import type { Category } from '@/data/categories';
import { categoryName } from '@/features/categories/categoryName';
import { useLanguage } from '@/i18n';

import { categoryTestKey } from './labels';
import {
  MIN_SPLIT_PARTS,
  newSplitPart,
  remainingRappen,
  removePart,
  updatePart,
  type SplitDraftPart,
  type SplitPartProblem,
  type SplitProblem,
} from './split';

export type SplitFieldsProps = {
  /** The transaction's amount without sign; null while it cannot be read (quick add). */
  totalAbs: Rappen | null;
  parts: SplitDraftPart[];
  onChange: (parts: SplitDraftPart[]) => void;
  /** Active categories, in the person's order. */
  categories: readonly Category[];
  /** Set after a failed save, so mistakes are pointed out only once the person tried. */
  problem?: SplitProblem;
  partProblems?: Record<string, SplitPartProblem>;
  testID: string;
};

/**
 * The split editor of quick add and the transaction detail, with translated labels, the live
 * "left to assign" and the validation messages.
 */
export function SplitFields({
  totalAbs,
  parts,
  onChange,
  categories,
  problem,
  partProblems = {},
  testID,
}: SplitFieldsProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const chf = (amount: Rappen) => formatChf(amount, { language });

  const left = totalAbs === null ? null : remainingRappen(totalAbs, parts);
  const remaining =
    left === null
      ? t('split.needsTotal')
      : left === 0
        ? t('split.exact')
        : left > 0
          ? t('split.left', { amount: chf(left) })
          : t('split.over', { amount: chf(-left) });
  const remainingTone =
    left === null ? 'secondary' : left === 0 ? 'ok' : left < 0 ? 'danger' : 'secondary';

  const error =
    problem === 'too_few'
      ? t('split.tooFew', { count: MIN_SPLIT_PARTS })
      : problem === 'not_exact' && totalAbs !== null
        ? t('split.notExact', { amount: chf(totalAbs) })
        : problem === 'parts'
          ? t('split.partsInvalid')
          : undefined;

  return (
    <SplitEditor
      parts={parts.map((part) => {
        const partProblem = partProblems[part.key];
        return {
          key: part.key,
          category: part.categoryId,
          amountText: part.amountText,
          categoryError: partProblem?.category ? t('split.categoryRequired') : undefined,
          amountError:
            partProblem?.amount === 'required'
              ? t('split.amountRequired')
              : partProblem?.amount === 'invalid'
                ? t('split.amountInvalid')
                : undefined,
        };
      })}
      categories={categories.map((category) => ({
        value: category.id,
        label: categoryName(category, t),
        testKey: categoryTestKey(category),
      }))}
      currency={BASE_CURRENCY}
      onChangeAmount={(key, amountText) => onChange(updatePart(parts, key, { amountText }))}
      onChangeCategory={(key, categoryId) => onChange(updatePart(parts, key, { categoryId }))}
      onRemove={(key) => onChange(removePart(parts, key))}
      onAdd={() => onChange([...parts, newSplitPart()])}
      canRemove={parts.length > MIN_SPLIT_PARTS}
      labels={{
        part: (number) => t('split.part', { number }),
        amount: t('split.amount'),
        category: t('split.category'),
        chooseCategory: t('split.chooseCategory'),
        remove: (number) => t('split.removePart', { number }),
        add: t('split.add'),
      }}
      remaining={remaining}
      remainingTone={remainingTone}
      error={error}
      testID={testID}
    />
  );
}
