import { i18n } from '@/i18n';

import { categoryName } from './categoryName';

describe('categoryName', () => {
  it('translates default categories and keeps custom names', async () => {
    await i18n.changeLanguage('de');
    const t = i18n.t.bind(i18n);
    expect(categoryName({ defaultKey: 'groceries', name: null }, t)).toBe('Lebensmittel');
    expect(categoryName({ defaultKey: null, name: 'Hund' }, t)).toBe('Hund');
    expect(categoryName({ defaultKey: null, name: null }, t)).toBe('');
    await i18n.changeLanguage('en');
    expect(categoryName({ defaultKey: 'eating_out', name: null }, i18n.t.bind(i18n))).toBe(
      'Eating out',
    );
  });
});
