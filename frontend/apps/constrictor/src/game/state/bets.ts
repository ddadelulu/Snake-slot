// Bet level handling (REQUIREMENTS §4): every level from authenticate is usable, stepBet is respected,
// min and max are selectable, and a refresh keeps the selected bet.

export type BetConfig = { minBet: number; maxBet: number; stepBet: number; defaultBetLevel: number; betLevels: number[] };

export function buildBetLevels(cfg: BetConfig): number[] {
	const { minBet, maxBet } = cfg;
	const step = cfg.stepBet > 0 ? cfg.stepBet : 0;
	let levels = (cfg.betLevels ?? []).filter((v) => Number.isFinite(v) && v > 0);
	if (minBet > 0) levels = levels.filter((v) => v >= minBet);
	if (maxBet > 0) levels = levels.filter((v) => v <= maxBet);
	if (!levels.length && minBet > 0 && maxBet >= minBet && step > 0) {
		for (let v = minBet; v <= maxBet && levels.length < 500; v += step) levels.push(v);
	}
	if (minBet > 0 && !levels.includes(minBet)) levels.push(minBet);
	if (maxBet > 0 && !levels.includes(maxBet) && (step === 0 || (maxBet - minBet) % step === 0 || cfg.betLevels?.includes(maxBet))) levels.push(maxBet);
	levels = [...new Set(levels)].sort((a, b) => a - b);
	return levels;
}

export function pickInitialBet(levels: number[], cfg: BetConfig, persisted: number | null, resumeAmount?: number | null): number {
	if (!levels.length) return cfg.defaultBetLevel || 1_000_000;
	if (resumeAmount && levels.includes(resumeAmount)) return resumeAmount;
	if (persisted && levels.includes(persisted)) return persisted;
	if (levels.includes(cfg.defaultBetLevel)) return cfg.defaultBetLevel;
	// nearest level to the default
	return levels.reduce((best, v) => (Math.abs(v - cfg.defaultBetLevel) < Math.abs(best - cfg.defaultBetLevel) ? v : best), levels[0]);
}

const key = (currency: string) => `constrictor.bet.${currency}`;
export function loadPersistedBet(currency: string): number | null {
	try {
		const v = localStorage.getItem(key(currency));
		return v ? Number(v) : null;
	} catch {
		return null;
	}
}
export function persistBet(currency: string, amount: number) {
	try {
		localStorage.setItem(key(currency), String(amount));
	} catch {
		/* storage unavailable: fine */
	}
}
