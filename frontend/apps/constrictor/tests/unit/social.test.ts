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
	it("applies Engine's social-mode word list exactly (#77)", () => {
		const list: [string, string][] = [
			['win feature', 'play feature'], ['pay out', 'win'], ['paid out', 'win'], ['stake', 'play amount'], ['pays out', 'won'],
			['betting', 'playing'], ['total bet', 'total play'], ['bet', 'play'], ['bets', 'plays'], ['cash', 'coins'], ['payer', 'winner'],
			['pay', 'win'], ['pays', 'wins'], ['paid', 'won'], ['money', 'coins'], ['buy', 'play'], ['bought', 'instantly triggered'],
			['purchase', 'play'], ['at the cost of', 'for'], ['rebet', 'respin'], ['cost of', 'can be played for'], ['credit', 'coins'],
			['buy bonus', 'get bonus'], ['gamble', 'play'], ['wager', 'play'], ['deposit', 'get coins'], ['withdraw', 'redeem'],
			['bonus buy', 'bonus'], ["be awarded to player's accounts", "appear in player's accounts"], ['place your bets', 'come and play'],
			['bet/s', 'play/s'], ['currency', 'token'],
		];
		for (const [from, to] of list) {
			expect(socialize(from), from).toBe(to);
			expect(findRestricted(socialize(from.toUpperCase())), from).toEqual([]);
		}
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
