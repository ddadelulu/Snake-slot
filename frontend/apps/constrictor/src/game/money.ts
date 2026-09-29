// Money display (REQUIREMENTS §4; docs/reference/currencies). RGS amounts are integers with 6 decimals.

export const API_UNIT = 1_000_000;

type Meta = { symbol: string; decimals: number; after?: boolean };

// Full table from the Stake Engine currency reference.
export const CURRENCIES: Record<string, Meta> = {
	USD: { symbol: '$', decimals: 2 },
	CAD: { symbol: 'CA$', decimals: 2 },
	JPY: { symbol: '¥', decimals: 0 },
	EUR: { symbol: '€', decimals: 2 },
	RUB: { symbol: '₽', decimals: 2 },
	CNY: { symbol: 'CN¥', decimals: 2 },
	PHP: { symbol: '₱', decimals: 2 },
	INR: { symbol: '₹', decimals: 2 },
	IDR: { symbol: 'Rp', decimals: 0 },
	KRW: { symbol: '₩', decimals: 0 },
	BRL: { symbol: 'R$', decimals: 2 },
	MXN: { symbol: 'MX$', decimals: 2 },
	DKK: { symbol: 'KR', decimals: 2, after: true },
	PLN: { symbol: 'zł', decimals: 2, after: true },
	VND: { symbol: '₫', decimals: 0, after: true },
	TRY: { symbol: '₺', decimals: 2 },
	CLP: { symbol: 'CLP', decimals: 0, after: true },
	ARS: { symbol: 'ARS', decimals: 2, after: true },
	PEN: { symbol: 'S/', decimals: 2 },
	NGN: { symbol: '₦', decimals: 2 },
	SAR: { symbol: 'SAR', decimals: 2, after: true },
	ILS: { symbol: 'ILS', decimals: 2, after: true },
	AED: { symbol: 'AED', decimals: 2, after: true },
	TWD: { symbol: 'NT$', decimals: 2 },
	NOK: { symbol: 'kr', decimals: 2 },
	KWD: { symbol: 'KD', decimals: 2 },
	JOD: { symbol: 'JD', decimals: 2 },
	CRC: { symbol: '₡', decimals: 2 },
	TND: { symbol: 'TND', decimals: 2, after: true },
	SGD: { symbol: 'SG$', decimals: 2 },
	MYR: { symbol: 'RM', decimals: 2 },
	OMR: { symbol: 'OMR', decimals: 2, after: true },
	QAR: { symbol: 'QAR', decimals: 2, after: true },
	BHD: { symbol: 'BD', decimals: 2 },
	XGC: { symbol: 'GC', decimals: 2, after: true },
	XSC: { symbol: 'SC', decimals: 2, after: true },
};

export const currencyMeta = (code: string): Meta => CURRENCIES[code?.toUpperCase?.()] ?? { symbol: code || '', decimals: 2, after: true };

function group(intPart: string) {
	return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format a raw RGS integer amount. Rounds down to the currency's decimals (never shows more than paid). */
export function formatMoney(raw: number, currency: string, opts: { symbol?: boolean } = {}): string {
	const meta = currencyMeta(currency);
	const neg = raw < 0;
	const abs = Math.abs(Math.round(raw));
	const unit = API_UNIT / 10 ** meta.decimals;
	const scaled = Math.floor(abs / unit); // integer in the smallest displayed unit
	const s = String(scaled).padStart(meta.decimals + 1, '0');
	const ip = s.slice(0, s.length - meta.decimals) || '0';
	const fp = meta.decimals ? '.' + s.slice(s.length - meta.decimals) : '';
	const num = group(ip) + fp;
	if (opts.symbol === false) return (neg ? '-' : '') + num;
	const out = meta.after ? `${num} ${meta.symbol}` : `${meta.symbol}${num}`;
	return (neg ? '-' : '') + out;
}

/** Book amounts are hundredths of the bet (100 = 1x). Returns the raw RGS money for a given bet. */
export function bookToMoney(bookAmount: number, betRaw: number): number {
	// exact integer math: betRaw * bookAmount / 100 (bookAmount is a multiple of 10)
	return Math.round((betRaw * bookAmount) / 100);
}

export function formatMultiplier(bookAmount: number): string {
	const x = bookAmount / 100;
	return `${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
}
