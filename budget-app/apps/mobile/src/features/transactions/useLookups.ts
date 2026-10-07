import { useMemo } from 'react';

import { useCategories } from '@/data/categories';
import { useFixedCosts } from '@/data/fixedCosts';

import { toLookups, type Lookups } from './labels';

/** Category and fixed-cost names for transaction lists and the detail screen. */
export function useLookups(): Lookups {
  const categories = useCategories();
  const fixedCosts = useFixedCosts();
  return useMemo(
    () => toLookups(categories.data, fixedCosts.data),
    [categories.data, fixedCosts.data],
  );
}
