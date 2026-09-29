// CONSTRICTOR patch: (1) accept an explicit http(s):// rgs_url (local mock RGS in development) while
// keeping the Stake contract of a bare host ("rgs.stake-engine.com" -> https://...), (2) never log to
// the console (approval: clean console), (3) surface RGS errors as data instead of throwing on JSON.
import type { paths } from './schema';
import { fetcher } from 'utils-fetcher';

export const rgsBase = (rgsUrl: string) => (/^https?:\/\//i.test(rgsUrl) ? rgsUrl.replace(/\/$/, '') : `https://${rgsUrl}`);

async function readJson(response: Response) {
	try {
		return await response.json();
	} catch {
		return { error: 'ERR_GEN', message: `HTTP ${response.status}` };
	}
}

export const rgsFetcher = {
	post: async function post<
		T extends keyof paths,
		TResponse = paths[T]['post']['responses'][200]['content']['application/json'],
	>(options: {
		url: T;
		rgsUrl: string;
		variables?: paths[T]['post']['requestBody']['content']['application/json'];
	}): Promise<TResponse> {
		const response = await fetcher({
			method: 'POST',
			variables: options.variables,
			endpoint: `${rgsBase(options.rgsUrl)}${options.url}`,
		});
		return (await readJson(response)) as TResponse;
	},
	// GET paths (bet replay) are dynamic and not in the generated schema.
	get: async function get<TResponse = unknown>(options: { url: string; rgsUrl: string }): Promise<TResponse> {
		const response = await fetcher({
			method: 'GET',
			endpoint: `${rgsBase(options.rgsUrl)}${options.url}`,
		});
		return (await readJson(response)) as TResponse;
	},
};
