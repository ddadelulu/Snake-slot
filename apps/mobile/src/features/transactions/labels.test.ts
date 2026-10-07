import type { Category } from '@/data/categories';
import type { FixedCost } from '@/data/fixedCosts';
import { i18n } from '@/i18n';

import {
  activeCategories,
  categoryTestKey,
  fixedCostName,
  placementLabel,
  toLookups,
} from './labels';

const GROCERIES: Category = {
  id: 'c-groceries',
  defaultKey: 'groceries',
  name: null,
  icon: null,
  sortOrder: 0,
  archived: false,
};
const DOG: Category = { ...GROCERIES, id: 'c-dog', defaultKey: null, name: 'Dog', sortOrder: 1 };
const OLD: Category = { ...DOG, id: 'c-old', name: 'Old', archived: true };
const RENT: FixedCost = {
  id: 'f-rent',
  kind: 'rent',
  label: null,
  amountRappen: 185000,
  merchantHint: null,
  active: true,
};

const BASE = { categoryId: null, fixedCostId: null, splits: [] };

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('category helpers', () => {
  it('names categories in testIDs by key or name', () => {
    expect(categoryTestKey(GROCERIES)).toBe('groceries');
    expect(categoryTestKey(DOG)).toBe('Dog');
    expect(categoryTestKey({ id: 'c-x', defaultKey: null, name: null })).toBe('c-x');
  });

  it('offers only categories that are not archived', () => {
    expect(activeCategories([GROCERIES, OLD, DOG])).toEqual([GROCERIES, DOG]);
  });

  it('names a fixed cost by its label or kind', () => {
    const t = i18n.t.bind(i18n);
    expect(fixedCostName(RENT, t)).toBe('Rent');
    expect(fixedCostName({ ...RENT, label: 'Wohnung' }, t)).toBe('Wohnung');
  });
});

describe('placementLabel', () => {
  const lookups = toLookups([GROCERIES, DOG, OLD], [RENT]);
  const t = i18n.t.bind(i18n);

  it('says Split, the fixed cost, the category or Not categorized', () => {
    expect(
      placementLabel(
        { ...BASE, splits: [{ id: 's', categoryId: 'c-dog', amountRappen: -1, note: null }] },
        lookups,
        t,
      ),
    ).toBe('Split');
    expect(placementLabel({ ...BASE, fixedCostId: 'f-rent' }, lookups, t)).toBe(
      'Rent (fixed cost)',
    );
    expect(placementLabel({ ...BASE, categoryId: 'c-groceries' }, lookups, t)).toBe('Groceries');
    expect(placementLabel({ ...BASE, categoryId: 'c-old' }, lookups, t)).toBe('Old');
    expect(placementLabel(BASE, lookups, t)).toBe('Not categorized');
  });

  it('still says fixed cost when that fixed cost is not loaded', () => {
    expect(placementLabel({ ...BASE, fixedCostId: 'f-gone' }, toLookups([], []), t)).toBe(
      'Fixed cost',
    );
  });

  it('stays empty while the names it needs are loading', () => {
    const loading = toLookups(undefined, undefined);
    expect(placementLabel({ ...BASE, categoryId: 'c-groceries' }, loading, t)).toBe('');
    expect(placementLabel({ ...BASE, fixedCostId: 'f-rent' }, loading, t)).toBe('');
    expect(placementLabel(BASE, loading, t)).toBe('Not categorized');
  });

  it('speaks German', async () => {
    await i18n.changeLanguage('de');
    const german = i18n.t.bind(i18n);
    expect(placementLabel(BASE, lookups, german)).toBe('Ohne Kategorie');
    expect(placementLabel({ ...BASE, categoryId: 'c-groceries' }, lookups, german)).toBe(
      'Lebensmittel',
    );
  });
});
