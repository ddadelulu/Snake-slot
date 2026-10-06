// Bet level handling (Engine guidelines #242 / #187): the bet ladder is exactly `betLevels` from authenticate
// (within minBet..maxBet), the game opens on `defaultBetLevel`, and an unfinished round's amount wins over the
// default. Nothing is remembered between sessions: a remembered bet would override `defaultBetLevel`.

export type BetConfig = { minBet: number; maxBet: number; stepBet: number; defaultBetLevel: number; betLevels: number[] };

export function buildBetLevels(cfg: BetConfig): number[] {
	const { minBet, maxBet } = cfg;
	const listed = (cfg.betLevels ?? []).filter((v) => Number.isFinite(v) && v > 0);
	if (listed.length) {
		// betLevels is the ladder; min/max only trim it and never add levels of their own
		const inRange = listed.filter((v) => (!(minBet > 0) || v >= minBet) && (!(maxBet > 0) || v <= maxBet));
		return [...new Set(inRange.length ? inRange : listed)].sort((a, b) => a - b);
	}
	// no list sent: step from min to max
	const step = cfg.stepBet > 0 ? cfg.stepBet : 0;
	const levels: number[] = [];
	if (minBet > 0 && maxBet >= minBet && step > 0) {
		for (let v = minBet; v <= maxBet && levels.length < 500; v += step) levels.push(v);
		// a very long ladder is capped at 500 levels; keep maxBet reachable when it is on the step grid
		if (levels[levels.length - 1] !== maxBet && (maxBet - minBet) % step === 0) levels.push(maxBet);
	} else if (minBet > 0) {
		levels.push(minBet);
		if (maxBet > minBet) levels.push(maxBet);
	}
	return levels;
}

export function pickInitialBet(levels: number[], cfg: BetConfig, resumeAmount?: number | null): number {
	if (!levels.length) return cfg.defaultBetLevel || 1_000_000;
	if (resumeAmount && levels.includes(resumeAmount)) return resumeAmount;
	if (levels.includes(cfg.defaultBetLevel)) return cfg.defaultBetLevel;
	// nearest level to the default
	return levels.reduce((best, v) => (Math.abs(v - cfg.defaultBetLevel) < Math.abs(best - cfg.defaultBetLevel) ? v : best), levels[0]);
}
