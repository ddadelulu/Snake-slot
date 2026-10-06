// Rules popup compliance (REQUIREMENTS §5.1/§5.2): the text the game renders must state every rule the brief
// and Stake require. With EXPORT_RULES=1 the exact player-facing text is written to docs/RULES.md.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import mathConfig from '../../src/game/generated/mathConfig.json';
import { configureI18n, t } from '../../src/game/i18n';
import { rulesSections, uiGuide, disclaimer, anteFactor, modeRtp } from '../../src/game/i18n/rules';

configureI18n({ social: false, lang: 'en' });
const sections = rulesSections();
const all = sections.flatMap((s) => [s.title, ...s.paragraphs]).join('\n') + '\n' + uiGuide().map((g) => `${g.label}: ${g.text}`).join('\n') + '\n' + disclaimer();

describe('rules popup content', () => {
	it('states every pearl value and the multiplier effects', () => {
		for (const v of ['+1', '+2', '+3', '+5', '+10', '+25']) expect(all).toContain(v);
		expect(all).toMatch(/added to the multiplier/);
		expect(all).toMatch(/multiplier is doubled/i);
	});
	it('states triggers, awards, retrigger and the 30-spin cap', () => {
		expect(all).toMatch(/3, 4 or 5 KEYs .* 10, 12 or 15 free spins/);
		expect(all).toMatch(/\+5 free spins, up to 30 free spins/);
	});
	it('states RTP, cost and max win for every mode', () => {
		for (const m of mathConfig.modes) {
			expect(all).toContain(`${(modeRtp(m.id) * 100).toFixed(2)}%`);
		}
		expect(all).toMatch(/25,000× the base bet in every mode/);
		for (const m of mathConfig.modes) expect(t(`mode.${m.id}`)).not.toBe(`mode.${m.id}`);
		expect(anteFactor()).toBeGreaterThan(4);
	});
	it('states the cap forfeit rule and the OUROBOROS move forfeit', () => {
		expect(all).toMatch(/round ends immediately and any remaining free spins or moves are forfeited/);
		expect(all).toMatch(/moves left on the counter are forfeited/);
	});
	it('has a UI guide entry for every control, labelled as it reads on screen (#235)', () => {
		const labels = uiGuide().map((g) => g.label);
		const has = (s: string) => labels.some((l) => l.includes(s));
		// taskbar, menu popup, bonus menu and dialog buttons (Taskbar.svelte, BonusButton.svelte, ConfirmModal.svelte)
		for (const k of ['button.spin', 'hud.bet', 'button.buyBonus', 'button.ante', 'menu.rules', 'menu.settings', 'button.confirm', 'button.cancel']) expect(has(t(k)), k).toBe(true);
		for (const s of ['− / +', 'MENU', 'AUTO SPIN:', 'SPEED: ×1 / ×2', 'SOUND: ON / OFF', '✕']) expect(has(s), s).toBe(true);
		// no guide entry for a control the game does not have
		expect(labels).not.toContain('i');
		expect(labels).not.toContain('TURBO');
		expect(labels).not.toContain('BUY');
	});
	it('social-mode guide labels match the social button text', () => {
		configureI18n({ social: true, lang: 'en' });
		const labels = uiGuide().map((g) => g.label);
		expect(labels).toContain('GET BONUS');
		expect(labels).toContain('PLAY');
		configureI18n({ social: false, lang: 'en' });
	});
	it('covers every disclaimer point', () => {
		const d = disclaimer();
		for (const re of [/Malfunction voids all wins and plays/, /internet connection is required/, /reload the game/, /expected return is calculated over many plays/, /not representative of any physical device/, /Remote Game Server/, /©/]) expect(d).toMatch(re);
	});
	it.runIf(process.env.EXPORT_RULES)('exports docs/RULES.md', () => {
		const out: string[] = ['# CONSTRICTOR: player-facing rules (generated)', '', '_Generated from `frontend/apps/constrictor/src/game/i18n/rules.ts` by `EXPORT_RULES=1 npx vitest run tests/unit/rules.test.ts`. This is the exact text the game shows._', ''];
		for (const s of sections) out.push(`## ${s.title}`, '', ...s.paragraphs.flatMap((p) => [p, '']));
		out.push('## MODES', '');
		for (const m of mathConfig.modes) {
			const fs2 = mathConfig.freeSpins;
			const desc = m.id === 'ante' ? t('mode.ante.desc', { cost: m.cost, factor: anteFactor() }) : m.id === 'venom' ? t('mode.venom.desc', { cost: m.cost, len: fs2.venomLength, mult: fs2.venomMult }) : t(`mode.${m.id}.desc`, { cost: m.cost });
			out.push(`- **${t(`mode.${m.id}`)}** (${m.cost}×, RTP ${(modeRtp(m.id) * 100).toFixed(2)}%, max win ${m.maxWin.toLocaleString('en-US')}×): ${desc}`);
		}
		out.push('', '## PAYTABLE (× bet by cluster size)', '', '| Symbol | ' + mathConfig.paytable.bands.map(([a, b]) => (b >= 49 ? `${a}+` : a === b ? `${a}` : `${a}–${b}`)).join(' | ') + ' |', '|---|' + mathConfig.paytable.bands.map(() => '---|').join(''));
		for (const [k, row] of Object.entries(mathConfig.paytable.symbols)) out.push(`| ${k} | ${(row as number[]).join(' | ')} |`);
		out.push('', '## UI GUIDE', '', ...uiGuide().map((g) => `- **${g.label}**: ${g.text}`), '', '## LEGAL', '', disclaimer(), '');
		fs.writeFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'RULES.md'), out.join('\n'));
	});
});
