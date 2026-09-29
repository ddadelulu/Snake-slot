<!-- Presentation overlays driven by emitter events: win tiers with count-up, feature intro/outro,
     retrigger, OUROBOROS title and max win. All timings go through the clock (turbo/skip aware). -->
<script lang="ts">
	import { eventEmitter } from '$game/emitter';
	import { game } from '$game/state/game.svelte';
	import { t } from '$game/i18n';
	import { formatMoney, bookToMoney } from '$game/money';
	import { clock, ease } from '$game/stage/clock';
	import { sound } from '$game/sound';
	import { requestSkip } from '$game/round';

	type Card =
		| { kind: 'tier'; level: number; amount: number }
		| { kind: 'intro'; feature: 'hunt' | 'venom'; spins: number }
		| { kind: 'outro'; amount: number; capped: boolean; feature: 'hunt' | 'venom' }
		| { kind: 'retrigger'; added: number }
		| { kind: 'maxWin'; amount: number };

	let card = $state<Card | null>(null);
	let shown = $state(0); // count-up value (book hundredths)
	let ouro = $state(0); // OUROBOROS title flash counter
	let pop = $state<{ amount: number; id: number } | null>(null);

	const BOLTS = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);
	const SPOKES = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 3);
	const TIER_KEYS = ['', 'win.strike', 'win.constrict', 'win.devour', 'win.apex', 'win.vaultEmpty'];
	const STINGERS = ['', 'stinger_strike', 'stinger_constrict', 'stinger_devour', 'stinger_apex', 'stinger_vault_empty'];
	const COUNT_MS = [0, 1200, 1900, 2800, 3800, 5200];

	const money = (x: number) => formatMoney(bookToMoney(x, game.roundBet), game.currency);
	const ms = (normal: number) => (clock.speed > 1 ? normal * 0.45 : normal);

	async function countUp(amount: number, dur: number) {
		shown = 0;
		sound.loop('countup_loop', { volume: 0.5 });
		await clock.tween(dur, (p) => (shown = Math.round(amount * p)), ease.out);
		shown = amount;
		sound.stop('countup_loop', 0.1);
	}

	async function tier(level: number, amount: number) {
		card = { kind: 'tier', level, amount };
		sound.play(STINGERS[level] ?? 'stinger_strike');
		await countUp(amount, ms(COUNT_MS[level] ?? 1200));
		await clock.wait(ms(700));
		card = null;
	}

	eventEmitter.subscribeOnMount({
		tierWin: async (e) => tier(e.level, e.amount),
		featureIntro: async (e) => {
			card = { kind: 'intro', feature: e.feature, spins: e.spins };
			sound.play('hunt_intro_sting');
			await clock.wait(ms(2600));
			card = null;
		},
		featureOutro: async (e) => {
			const feature = game.feature ?? 'hunt';
			card = { kind: 'outro', amount: e.amount, capped: e.capped, feature };
			if (e.amount > 0) await countUp(e.amount, ms(Math.min(4200, 1400 + e.level * 700)));
			else shown = 0;
			await clock.wait(ms(1800));
			card = null;
		},
		retrigger: async (e) => {
			card = { kind: 'retrigger', added: e.added };
			await clock.wait(ms(1500));
			card = null;
		},
		ouroborosTitle: () => {
			ouro++;
			sound.play('ouroboros_sting');
		},
		maxWin: async (e) => {
			card = { kind: 'maxWin', amount: e.amount };
			sound.play('stinger_vault_empty');
			await countUp(e.amount, ms(3600));
			await clock.wait(ms(2200));
			card = null;
		},
		spinWin: (e) => {
			pop = { amount: e.amount, id: (pop?.id ?? 0) + 1 };
		},
	});
</script>

{#if card}
	<div class="overlay" class:dim={card.kind !== 'retrigger'} role="presentation" onclick={requestSkip}>
		{#if card.kind === 'tier'}
			<div class="tier lvl{card.level}">
				<div class="title display">{t(TIER_KEYS[card.level] ?? 'win.strike')}</div>
				<div class="amount num">{money(shown)}</div>
				<div class="hint">{t('win.tapToSkip')}</div>
			</div>
		{:else if card.kind === 'intro'}
			<svg class="vault" class:venom={card.feature === 'venom'} viewBox="-100 -100 200 200" aria-hidden="true">
				<circle r="94" class="rim" />
				<circle r="82" class="plate" />
				{#each BOLTS as a}<circle cx={87 * Math.cos(a)} cy={87 * Math.sin(a)} r="3.4" class="bolt" />{/each}
				<g class="wheel">
					{#each SPOKES as a}<line x1={14 * Math.cos(a)} y1={14 * Math.sin(a)} x2={56 * Math.cos(a)} y2={56 * Math.sin(a)} />{/each}
					<circle r="58" class="wheel-rim" />
					<circle r="14" class="hub" />
				</g>
			</svg>
			<div class="intro" class:venom={card.feature === 'venom'}>
				<div class="rule"></div>
				<div class="title display">{card.feature === 'venom' ? t('feature.venomTitle') : t('feature.huntTitle')}</div>
				<div class="sub">{t('feature.freeSpins', { n: card.spins })}</div>
				<div class="rule"></div>
			</div>
		{:else if card.kind === 'outro'}
			<div class="intro" class:venom={card.feature === 'venom'}>
				<div class="sub">{t('feature.summary')}</div>
				<div class="amount num">{money(shown)}</div>
				{#if card.capped}<div class="note">{t('feature.maxReached')}</div>{/if}
			</div>
		{:else if card.kind === 'retrigger'}
			<div class="retrigger display">{t('feature.retrigger', { n: card.added })}</div>
		{:else if card.kind === 'maxWin'}
			<div class="tier lvl5">
				<div class="title display">{t('win.vaultEmpty')}</div>
				<div class="amount num">{money(shown)}</div>
				<div class="note">{t('feature.maxReached')}</div>
			</div>
		{/if}
	</div>
{/if}

{#key ouro}
	{#if ouro > 0}
		<div class="ouro display" aria-hidden="true">{t('ouroboros.title')}</div>
	{/if}
{/key}

{#if pop}
	{#key pop.id}
		<div class="pop num" aria-hidden="true">{money(pop.amount)}</div>
	{/key}
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: grid;
		place-items: center;
		cursor: pointer;
		pointer-events: auto;
	}
	.overlay.dim {
		background: radial-gradient(ellipse at center, rgba(7, 8, 10, 0.35), rgba(7, 8, 10, 0.8));
		animation: fade 220ms ease both;
	}
	.tier,
	.intro {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(4px, 1.2vh, 12px);
		text-align: center;
		padding: 0 16px;
	}
	.title {
		font-size: clamp(34px, 11vmin, 120px);
		line-height: 0.95;
		color: var(--brass-hi);
		letter-spacing: 0.08em;
		text-shadow:
			0 2px 0 #3a2a10,
			0 0 30px rgba(217, 178, 111, 0.35);
		animation: slam 420ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	.lvl3 .title,
	.lvl4 .title {
		color: #f0d49a;
	}
	.lvl4 .title {
		font-size: clamp(38px, 12.5vmin, 140px);
	}
	.lvl5 .title {
		font-family: 'Limelight', var(--font-display);
		font-weight: 400;
		color: var(--venom);
		text-shadow:
			0 2px 0 #06301a,
			0 0 40px rgba(61, 255, 138, 0.45);
		font-size: clamp(30px, 9vmin, 110px);
	}
	.amount {
		font-size: clamp(24px, 7vmin, 72px);
		font-weight: 800;
		color: var(--ivory);
		letter-spacing: 0.02em;
	}
	.hint,
	.note {
		font-size: clamp(10px, 1.7vh, 13px);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ivory-dim);
	}
	.note {
		text-transform: none;
		letter-spacing: 0.04em;
		max-width: 420px;
	}
	.intro .title {
		font-size: clamp(40px, 13vmin, 150px);
	}
	.intro.venom .title {
		color: var(--venom);
		text-shadow: 0 0 36px rgba(61, 255, 138, 0.4);
	}
	.sub {
		font-weight: 800;
		letter-spacing: 0.3em;
		font-size: clamp(12px, 2.6vh, 22px);
		color: var(--ivory);
	}
	.rule {
		width: min(60vw, 420px);
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--brass-hi), transparent);
	}
	.vault {
		position: absolute;
		left: 50%;
		top: 50%;
		width: min(78vmin, 560px);
		height: min(78vmin, 560px);
		transform: translate(-50%, -50%);
		pointer-events: none;
		opacity: 0.4;
		animation: vaultdoor 2600ms ease-in both;
	}
	.vault .rim {
		fill: #16181b;
		stroke: #9c7a45;
		stroke-width: 3;
	}
	.vault .plate {
		fill: none;
		stroke: rgba(217, 178, 111, 0.35);
		stroke-width: 1.5;
	}
	.vault .bolt {
		fill: #d9b26f;
	}
	.vault .wheel {
		stroke: #d9b26f;
		stroke-width: 5;
		stroke-linecap: round;
		fill: none;
		animation: wheel 1500ms cubic-bezier(0.5, 0, 0.3, 1) both;
	}
	.vault .wheel-rim {
		stroke-width: 4;
	}
	.vault .hub {
		fill: #9c7a45;
	}
	.vault.venom .rim,
	.vault.venom .wheel {
		stroke: #3dff8a;
	}
	.vault.venom .bolt {
		fill: #3dff8a;
	}
	@keyframes wheel {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(300deg);
		}
	}
	@keyframes vaultdoor {
		0% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.9);
		}
		12%,
		60% {
			opacity: 0.55;
			transform: translate(-50%, -50%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%) scale(1.35);
		}
	}
	.intro {
		position: relative;
	}
	.retrigger {
		font-size: clamp(30px, 9vmin, 90px);
		color: var(--brass-hi);
		text-shadow: 0 0 24px rgba(217, 178, 111, 0.5);
		animation: slam 360ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	.ouro {
		position: fixed;
		left: 50%;
		top: 18%;
		transform: translateX(-50%);
		z-index: 29;
		pointer-events: none;
		font-size: clamp(30px, 10vmin, 110px);
		letter-spacing: 0.2em;
		color: var(--venom);
		text-shadow: 0 0 30px rgba(61, 255, 138, 0.55);
		animation: ouro 1900ms ease both;
	}
	.pop {
		position: fixed;
		left: 50%;
		top: 42%;
		transform: translate(-50%, -50%);
		z-index: 28;
		pointer-events: none;
		font-weight: 800;
		font-size: clamp(22px, 6vmin, 56px);
		color: var(--ivory);
		text-shadow:
			0 2px 0 #000,
			0 0 18px rgba(217, 178, 111, 0.6);
		animation: popwin 1300ms ease both;
	}
	@keyframes popwin {
		0% {
			opacity: 0;
			transform: translate(-50%, -30%) scale(0.8);
		}
		15%,
		70% {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -70%) scale(1);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes slam {
		0% {
			transform: scale(1.6);
			opacity: 0;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
	@keyframes ouro {
		0% {
			opacity: 0;
			letter-spacing: 0.6em;
		}
		20%,
		75% {
			opacity: 1;
			letter-spacing: 0.2em;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes flash {
		0% {
			opacity: 0;
		}
		20%,
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.vault,
		.vault .wheel,
		.title,
		.retrigger,
		.overlay.dim {
			animation: none;
		}
	}
</style>
