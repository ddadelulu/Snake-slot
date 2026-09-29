// Launch URL query parameters (REQUIREMENTS §4). Nothing is hardcoded: rgs_url always comes from the URL.

export type LaunchParams = {
	sessionID: string;
	rgsUrl: string;
	lang: string;
	currency: string | null;
	device: 'desktop' | 'mobile' | null;
	social: boolean;
	demo: boolean;
	replay: boolean;
	game: string;
	version: string;
	mode: string;
	event: string;
	amount: number | null; // raw RGS units (1_000_000 = 1.00)
	dev: boolean; // local development switches (never set by Stake)
};

const bool = (v: string | null) => v === 'true' || v === '1';

export function parseLaunchParams(search: string = typeof location !== 'undefined' ? location.search : ''): LaunchParams {
	const q = new URLSearchParams(search);
	const device = q.get('device');
	const amount = q.get('amount');
	const amountNum = amount !== null && /^\d+(\.\d+)?$/.test(amount) ? Math.round(Number(amount)) : null;
	return {
		sessionID: q.get('sessionID') ?? '',
		rgsUrl: q.get('rgs_url') ?? '',
		lang: (q.get('lang') ?? 'en').toLowerCase(),
		currency: q.get('currency'),
		device: device === 'mobile' || device === 'desktop' ? device : null,
		social: bool(q.get('social')),
		demo: bool(q.get('demo')),
		replay: bool(q.get('replay')),
		game: q.get('game') ?? '',
		version: q.get('version') ?? '',
		mode: q.get('mode') ?? '',
		event: q.get('event') ?? '',
		amount: amountNum,
		dev: bool(q.get('dev')),
	};
}
