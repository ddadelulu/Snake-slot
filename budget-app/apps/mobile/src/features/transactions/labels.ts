import type { DefaultCategoryKey } from '@budget/core';
import type { TFunction } from 'i18next';

import type { Category } from '@/data/categories';
import type { FixedCost } from '@/data/fixedCosts';
import type { TransactionItem } from '@/data/transactions';
import { categoryName } from '@/features/categories/categoryName';

/**
 * How a category is named in testIDs: its default key ("groceries") or the name the person gave
 * it ("Dog"), so end-to-end tests do not depend on database ids.
 */
export function categoryTestKey(category: {
  id: string;
  defaultKey: DefaultCategoryKey | null;
  name: string | null;
}): string {
  return category.defaultKey ?? category.name ?? category.id;
}

/** The categories a transaction can be placed in today, in the person's order. */
export function activeCategories(categories: readonly Category[]): Category[] {
  return categories.filter((category) => !category.archived);
}

/** A fixed cost's name: the label the person typed, else its kind ("Rent"). */
export function fixedCostName(fixedCost: Pick<FixedCost, 'kind' | 'label'>, t: TFunction): string {
  return fixedCost.label ?? t(`fixedCostKinds.${fixedCost.kind}`);
}

export type Lookups = {
  categories: ReadonlyMap<string, Category>;
  fixedCosts: ReadonlyMap<string, FixedCost>;
  /** False while categories or fixed costs are still loading. */
  ready: boolean;
};

export function toLookups(
  categories: readonly Category[] | undefined,
  fixedCosts: readonly FixedCost[] | undefined,
): Lookups {
  return {
    categories: new Map((categories ?? []).map((category) => [category.id, category])),
    fixedCosts: new Map((fixedCosts ?? []).map((fixedCost) => [fixedCost.id, fixedCost])),
    ready: categories !== undefined && fixedCosts !== undefined,
  };
}

/**
 * Where a transaction is placed, in one phrase: "Split", the fixed cost it pays, its category, or
 * "Not categorized". Empty while the names it needs are still loading, so the list never claims
 * "Not categorized" for a moment.
 */
export function placementLabel(
  transaction: Pick<TransactionItem, 'categoryId' | 'fixedCostId' | 'splits'>,
  lookups: Lookups,
  t: TFunction,
): string {
  if (transaction.splits.length > 0) return t('transactions.labels.split');
  const fixedCost = transaction.fixedCostId
    ? lookups.fixedCosts.get(transaction.fixedCostId)
    : undefined;
  if (fixedCost) return t('transactions.labels.fixedCost', { name: fixedCostName(fixedCost, t) });
  const category = transaction.categoryId
    ? lookups.categories.get(transaction.categoryId)
    : undefined;
  if (category) return categoryName(category, t);
  const referenced = transaction.fixedCostId !== null || transaction.categoryId !== null;
  if (referenced && !lookups.ready) return '';
  if (transaction.fixedCostId) return t('transactions.labels.fixedCostUnknown');
  return t('transactions.labels.uncategorized');
}
