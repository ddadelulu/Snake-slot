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
	import Digits from './Digits.svelte';

	type Card =
		| { kind: 'tier'; level: number; amount: number }
		| { kind: 'intro'; feature: 'hunt' | 'venom'; spins: number }
		| { kind: 'outro'; amount: number; capped: boolean; feature: 'hunt' | 'venom' }
		| { kind: 'retrigger'; added: number }
		| { kind: 'maxWin'; amount: number };

	let card = $state<Card | null>(null);
	let introMs = $state(3200);
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
			introMs = Math.round(ms(3200));
			card = { kind: 'intro', feature: e.feature, spins: e.spins };
			sound.play('hunt_intro_sting');
			await clock.wait(introMs);
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
	<div
		class="overlay"
		class:dim={card.kind !== 'retrigger'}
		class:reduced={game.reducedMotion}
		style="--T:{introMs}ms"
		role="presentation"
		onclick={requestSkip}
	>
		{#if card.kind === 'tier'}
			<div class="tier deco on-glass lvl{card.level}">
				<div class="title display">{t(TIER_KEYS[card.level] ?? 'win.strike')}</div>
				<div class="amount num"><Digits text={money(shown)} /></div>
				<div class="hint">{t('win.tapToSkip')}</div>
			</div>
		{:else if card.kind === 'intro'}
			<!-- STYLE_BIBLE §9: the key turns, the wheel spins, the door swings open, blackness, then the board -->
			<div class="veil" aria-hidden="true"></div>
			<div class="door-wrap" aria-hidden="true">
				<svg class="vault" class:venom={card.feature === 'venom'} viewBox="-100 -100 200 200">
					<circle r="94" class="rim" />
					<circle r="82" class="plate" />
					{#each BOLTS as a}<circle cx={87 * Math.cos(a)} cy={87 * Math.sin(a)} r="3.4" class="bolt" />{/each}
					<g class="wheel">
						{#each SPOKES as a}<line x1={14 * Math.cos(a)} y1={14 * Math.sin(a)} x2={56 * Math.cos(a)} y2={56 * Math.sin(a)} />{/each}
						<circle r="58" class="wheel-rim" />
						<circle r="14" class="hub" />
					</g>
					<g class="key">
						<circle cx="0" cy="-17" r="7" class="key-bow" />
						<rect x="-1.8" y="-10" width="3.6" height="27" rx="1" class="key-shaft" />
						<rect x="1.8" y="9" width="5" height="3" class="key-shaft" />
						<rect x="1.8" y="14" width="3.5" height="3" class="key-shaft" />
					</g>
				</svg>
			</div>
			<div class="intro deco on-glass" class:venom={card.feature === 'venom'}>
				<div class="rule"></div>
				<div class="title display">{card.feature === 'venom' ? t('feature.venomTitle') : t('feature.huntTitle')}</div>
				<div class="sub">{t('feature.freeSpins', { n: card.spins })}</div>
				<div class="rule"></div>
			</div>
		{:else if card.kind === 'outro'}
			<div class="intro deco on-glass" class:venom={card.feature === 'venom'}>
				<div class="sub">{t('feature.summary')}</div>
				<div class="amount num"><Digits text={money(shown)} /></div>
				{#if card.capped}<div class="note">{t('feature.maxReached')}</div>{/if}
			</div>
		{:else if card.kind === 'retrigger'}
			<div class="retrigger deco on-glass display">{t('feature.retrigger', { n: card.added })}</div>
		{:else if card.kind === 'maxWin'}
			<div class="tier deco on-glass lvl5">
				<div class="title display">{t('win.vaultEmpty')}</div>
				<div class="amount num"><Digits text={money(shown)} /></div>
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
		<div class="pop on-glass num" aria-hidden="true">{money(pop.amount)}</div>
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
		/* deco plaque (cut corners, brass edge), like the rest of the vault's hardware */
		--cut: 22px;
		--edge-w: 3px;
		--face: rgba(9, 9, 10, 0.96);
		max-width: 94vw;
		padding: clamp(16px, 3.4vh, 32px) clamp(24px, 4.4vw, 56px);
	}
	/* sticker titles: ink line, hard drop, a slight jaunty tilt */
	.title {
		font-size: clamp(30px, 9.5vmin, 108px);
		line-height: 1;
		color: var(--accent);
		letter-spacing: 0.03em;
		filter: var(--ink-outline-lg) drop-shadow(0 6px 0 rgba(0, 0, 0, 0.7));
		rotate: -3deg;
		animation: slam 420ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	.lvl4 .title {
		font-size: clamp(32px, 10.5vmin, 124px);
	}
	.lvl5 .title {
		font-weight: 400;
		color: var(--venom);
		font-size: clamp(26px, 7.6vmin, 96px);
	}
	.tier.lvl5::before,
	.intro.venom::before {
		background: linear-gradient(160deg, #b8ffd6 0%, #1fbf62 45%, #7dffb4 70%, #0c6b34 100%);
	}
	/* the amount: engraved gold figures between two hairlines */
	.amount {
		--digit-w: 0.64em;
		position: relative;
		font-size: clamp(24px, 6.8vmin, 68px);
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1.1;
		padding: 0.08em 0.4em;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		background: linear-gradient(180deg, #fbe7ab 0%, #e2b85a 48%, #a67c34 56%, #ecca72 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: var(--ink-outline-lg) drop-shadow(0 5px 0 rgba(0, 0, 0, 0.7));
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
		font-size: clamp(36px, 11.5vmin, 132px);
	}
	.intro.venom .title {
		color: var(--venom);
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
	.veil {
		position: fixed;
		inset: 0;
		background: #030304;
		opacity: 0;
		animation: veil var(--T) ease both;
	}
	.door-wrap {
		position: absolute;
		left: 50%;
		top: 50%;
		width: min(78vmin, 560px);
		height: min(78vmin, 560px);
		transform: translate(-50%, -50%);
		perspective: 1100px;
		pointer-events: none;
	}
	.vault {
		width: 100%;
		height: 100%;
		transform-origin: 0% 50%; /* hinge on the left */
		animation: doorswing var(--T) cubic-bezier(0.55, 0, 0.35, 1) both;
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
		animation: wheel var(--T) cubic-bezier(0.5, 0, 0.3, 1) both;
	}
	.vault .key {
		animation: keyturn var(--T) ease both;
	}
	.key-bow {
		fill: none;
		stroke: #d9b26f;
		stroke-width: 3;
	}
	.key-shaft {
		fill: #d9b26f;
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
	@keyframes keyturn {
		0% {
			opacity: 0;
			transform: rotate(0deg);
		}
		8%,
		15% {
			opacity: 1;
			transform: rotate(0deg);
		}
		28% {
			opacity: 1;
			transform: rotate(90deg);
		}
		40%,
		100% {
			opacity: 0;
			transform: rotate(90deg);
		}
	}
	@keyframes wheel {
		0%,
		26% {
			transform: rotate(0deg);
		}
		55%,
		100% {
			transform: rotate(300deg);
		}
	}
	@keyframes doorswing {
		0% {
			opacity: 0;
			transform: rotateY(0deg) scale(0.92);
		}
		10%,
		55% {
			opacity: 1;
			transform: rotateY(0deg) scale(1);
		}
		80% {
			opacity: 1;
			transform: rotateY(-100deg) scale(1);
		}
		100% {
			opacity: 0;
			transform: rotateY(-108deg) scale(1);
		}
	}
	@keyframes veil {
		0%,
		55% {
			opacity: 0;
		}
		80%,
		100% {
			opacity: 0.9;
		}
	}
	@keyframes introtitle {
		0%,
		58% {
			opacity: 0;
			transform: scale(0.9);
		}
		76%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}
	.intro {
		position: relative;
	}
	.door-wrap ~ .intro {
		animation: introtitle var(--T) ease both;
	}
	.reduced .veil,
	.reduced .vault,
	.reduced .vault .wheel,
	.reduced .vault .key,
	.reduced .door-wrap ~ .intro {
		animation: none;
	}
	.reduced .vault {
		opacity: 0.35;
	}
	.reduced .vault .key {
		opacity: 0;
	}
	.retrigger {
		font-size: clamp(26px, 7.5vmin, 76px);
		color: var(--ink);
		padding: 0.14em 0.9em;
		--cut: 16px;
		animation: slam 360ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	.ouro {
		position: fixed;
		left: 50%;
		top: 18%;
		transform: translateX(-50%);
		z-index: 29;
		pointer-events: none;
		font-size: clamp(28px, 9vmin, 100px);
		letter-spacing: 0.12em;
		color: #3dff8a;
		background: var(--paper);
		border: 0;
		border-top: 2px solid #3dff8a;
		border-bottom: 2px solid #3dff8a;
		border-radius: 0;
		padding: 0.06em 0.8em;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.45);
		white-space: nowrap;
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
		font-size: clamp(20px, 5vmin, 48px);
		color: var(--ink);
		background: rgba(9, 9, 10, 0.92);
		border: 0;
		border-top: 1.5px solid var(--edge);
		border-bottom: 1.5px solid var(--edge);
		border-radius: 0;
		padding: 0.1em 0.8em;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
		white-space: nowrap;
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
			letter-spacing: 0.4em;
		}
		20%,
		75% {
			opacity: 1;
			letter-spacing: 0.12em;
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
		.veil,
		.vault,
		.vault .wheel,
		.vault .key,
		.door-wrap ~ .intro,
		.title,
		.retrigger,
		.overlay.dim {
			animation: none;
		}
	}
</style>
