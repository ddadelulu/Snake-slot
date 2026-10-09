import type { DefaultCategoryKey } from '@budget/core';
import type { TFunction } from 'i18next';

/**
 * The display name of a category: default categories are stored by key and translated (D-017),
 * custom ones carry the name the person typed. A default category the person renamed in Settings
 * keeps its key (merchant matching uses it) and shows the new name.
 */
export function categoryName(
  category: { defaultKey: DefaultCategoryKey | null; name: string | null },
  t: TFunction,
): string {
  if (category.name) return category.name;
  return category.defaultKey ? t(`categories.${category.defaultKey}`) : '';
}
