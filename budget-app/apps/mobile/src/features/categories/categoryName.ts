import type { DefaultCategoryKey } from '@budget/core';
import type { TFunction } from 'i18next';

/**
 * The display name of a category: default categories are stored by key and translated (D-017),
 * custom ones carry the name the person typed.
 */
export function categoryName(
  category: { defaultKey: DefaultCategoryKey | null; name: string | null },
  t: TFunction,
): string {
  return category.defaultKey ? t(`categories.${category.defaultKey}`) : (category.name ?? '');
}
