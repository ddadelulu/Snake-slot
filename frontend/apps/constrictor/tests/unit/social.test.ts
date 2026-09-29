import { describe, expect, it } from 'vitest';
import { en } from '../../src/game/i18n/en';
import { configureI18n, t } from '../../src/game/i18n';
import { socialize, findRestricted } from '../../src/game/i18n/social';
import { rulesSections, uiGuide, disclaimer } from '../../src/game/i18n/rules';

describe('social mode wording', () => {
	it('replaces restricted words, keeping case', () => {
		expect(socialize('BET')).toBe('PLAY');
		expect(socialize('Total bet')).toBe('Total play');
		expect(socialize('Buy bonus')).toBe('Get bonus');
		expect(socialize('Pays 5x')).toBe('Wins 5x');
	});
	it('leaves no restricted word in any UI string, rule or the disclaimer', () => {
		configureI18n({ social: true, lang: 'en' });
		const texts: string[] = [];
		for (const k of Object.keys(en)) texts.push(t(k, { cost: 100, factor: 5, len: 8, mult: 2, n: 3, mode: 'THE HUNT', amount: '1.00 SC', current: 1, total: 10 }));
		for (const s of rulesSections()) texts.push(s.title, ...s.paragraphs);
		for (const g of uiGuide()) texts.push(g.label, g.text);
		texts.push(disclaimer());
		const bad = texts.map((x) => [x, findRestricted(x)] as const).filter(([, h]) => h.length);
		expect(bad).toEqual([]);
		configureI18n({ social: false, lang: 'en' });
	});
	it('any lang falls back to English without corrupting text', () => {
		for (const lang of ['ar', 'zh', 'ja', 'po', 'pl', 'xx', '']) {
			configureI18n({ social: false, lang });
			expect(t('button.spin')).toBe('SPIN');
		}
	});
});
