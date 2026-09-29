import { describe, expect, it } from 'vitest';
import { parseLaunchParams } from '../../src/game/url';
import { rgsBase } from '../../../../packages/rgs-fetcher/src/rgsFetcher';

describe('launch params', () => {
	it('reads every documented parameter', () => {
		const p = parseLaunchParams('?sessionID=abc&rgs_url=rgs.example.com&lang=DE&currency=EUR&device=mobile&social=true&demo=false');
		expect(p).toMatchObject({ sessionID: 'abc', rgsUrl: 'rgs.example.com', lang: 'de', currency: 'EUR', device: 'mobile', social: true, demo: false, replay: false });
	});
	it('reads replay parameters and a numeric amount', () => {
		const p = parseLaunchParams('?replay=true&game=constrictor&version=3&mode=hunt&event=42&rgs_url=x.com&amount=2000000');
		expect(p).toMatchObject({ replay: true, game: 'constrictor', version: '3', mode: 'hunt', event: '42', amount: 2_000_000 });
		expect(parseLaunchParams('?amount=abc').amount).toBeNull();
	});
	it('never invents an RGS host', () => {
		expect(parseLaunchParams('').rgsUrl).toBe('');
	});
	it('prefixes https:// for a bare host and keeps explicit schemes', () => {
		expect(rgsBase('rgs.stake-engine.com')).toBe('https://rgs.stake-engine.com');
		expect(rgsBase('http://localhost:8080/')).toBe('http://localhost:8080');
	});
});
