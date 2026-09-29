import { en, SOCIAL_OVERRIDES, type I18nKey } from './en';
import { socialize } from './social';

let socialMode = false;
let language = 'en';

export function configureI18n(opts: { social: boolean; lang: string }) {
	socialMode = opts.social;
	// Only English ships; any other code (including unknown ones) must not corrupt text -> English.
	language = 'en';
	void opts.lang;
}

export const isSocial = () => socialMode;
export const currentLanguage = () => language;

/** Translate a key, fill {params}, apply social-mode wording. Unknown keys return the key (never throw). */
export function t(key: I18nKey | string, params: Record<string, string | number> = {}): string {
	let s: string =
		(socialMode && (SOCIAL_OVERRIDES as Record<string, string>)[key]) || (en as Record<string, string>)[key] || key;
	for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
	return socialMode ? socialize(s) : s;
}

/** For free text (rules paragraphs built in code). */
export function tx(text: string): string {
	return socialMode ? socialize(text) : text;
}

export type { I18nKey };
