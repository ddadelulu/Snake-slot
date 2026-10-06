// Stake.us social-mode text layer (REQUIREMENTS §7; docs/reference/social-mode).
// Every user-visible string passes through `socialize` when social=true. Case-aware, longest phrase first.

const TABLE: [string, string][] = [
	['be awarded to player\'s accounts', "appear in player's accounts"],
	['place your bets', 'come and play'],
	['at the cost of', 'for'],
	['bonus buy', 'bonus'],
	['buy bonus', 'get bonus'],
	['cost of', 'can be played for'],
	['loss limit', 'stop limit'],
	['loss streak', 'miss streak'],
	['pay table', 'win table'],
	['paytable', 'win table'],
	['paid out', 'win'],
	['pays out', 'won'],
	['pay out', 'win'],
	['total bet', 'total play'],
	['win feature', 'play feature'],
	['bet/s', 'play/s'],
	['betting', 'playing'],
	['bets', 'plays'],
	['bet', 'play'],
	['bought', 'instantly triggered'],
	['buying', 'playing'],
	['buys', 'plays'],
	['buy', 'play'],
	['purchased', 'played'],
	['purchase', 'play'],
	['cash', 'coins'],
	['credits', 'coins'],
	['credit', 'coins'],
	['money', 'coins'],
	['currency', 'token'],
	['deposit', 'get coins'],
	['gambling', 'playing'],
	['gamble', 'play'],
	['paid', 'won'],
	['payer', 'winner'],
	['payouts', 'wins'],
	['payout', 'win'],
	['pays', 'wins'],
	['pay', 'win'],
	['profit', 'net gain'],
	['rebet', 'respin'],
	['stake', 'play amount'],
	['wagered', 'played'],
	['wager', 'play'],
	['withdraw', 'redeem'],
];

// The restricted words we test for (tests/unit/social.test.ts scans every string).
export const RESTRICTED = [
	// Engine's social-mode list (every entry is checked as a whole word / phrase, case-insensitive)
	"be awarded to player's accounts", 'place your bets', 'at the cost of', 'bonus buy', 'buy bonus', 'cost of', 'win feature',
	'total bet', 'paid out', 'pays out', 'pay out', 'bet/s', 'betting', 'bets', 'bet', 'bought', 'buy', 'purchase', 'cash',
	'credit', 'money', 'currency', 'deposit', 'gamble', 'paid', 'payer', 'pays', 'pay', 'stake', 'wager', 'withdraw', 'rebet',
	// also kept out
	'payout', 'profit', 'paytable', 'pay table', 'loss limit', 'loss streak',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const RULES = TABLE.map(([from, to]) => ({ re: new RegExp(`\\b${escape(from)}\\b`, 'gi'), to }));

function matchCase(src: string, repl: string) {
	if (src === src.toUpperCase() && /[A-Z]/.test(src)) return repl.toUpperCase();
	if (src[0] === src[0].toUpperCase() && /[A-Z]/.test(src[0])) return repl[0].toUpperCase() + repl.slice(1);
	return repl;
}

export function socialize(text: string): string {
	let out = text;
	for (const { re, to } of RULES) out = out.replace(re, (m) => matchCase(m, to));
	return out;
}

export function findRestricted(text: string): string[] {
	const hits: string[] = [];
	for (const w of RESTRICTED) if (new RegExp(`\\b${escape(w)}\\b`, 'i').test(text)) hits.push(w);
	return hits;
}
