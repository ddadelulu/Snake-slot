<!-- Snake / feature HUD: free-spin counter, feature win, MOVES, LENGTH and the multiplier. Values come from
     the book handlers through the game state; nothing is computed here. -->
<script lang="ts">
	import { game } from '$game/state/game.svelte';
	import { eventEmitter } from '$game/emitter';
	import { t } from '$game/i18n';
	import { formatMoney, bookToMoney } from '$game/money';

	type Props = { layout: 'side' | 'top'; showWin?: boolean; showStats?: boolean };
	let { layout, showWin = false, showStats = true }: Props = $props();

	let slam = $state(0);
	let big = $state(false);
	let movesPop = $state(0);
	eventEmitter.subscribeOnMount({
		multSlam: (e) => {
			big = e.big;
			slam++;
		},
		movesStart: () => {
			movesPop++;
		},
	});

	const snakeOn = $derived(game.snakeLen > 0 && (game.moves !== null || game.fs !== null));
	const money = (x: number) => formatMoney(bookToMoney(x, game.roundBet), game.currency);
</script>

<div class="hud on-glass {layout}">
	{#if game.fs}
		<div class="fs deco" class:venom={game.feature === 'venom'}>
			<span class="fs-title display">{game.fs.current === 0
					? t(game.feature === 'venom' ? 'hud.venomStart' : 'hud.freeSpinsStart', game.fs)
					: t(game.feature === 'venom' ? 'hud.venomSpins' : 'hud.freeSpins', game.fs)}</span>
			<span class="fs-win num">{money(game.featureWin)}</span>
		</div>
	{/if}
	{#if snakeOn && showStats}
		<div class="stats deco">
			<div class="stat">
				<span class="lbl">{t('hud.moves')}</span>
				{#key movesPop}
					<span class="val num mv" class:pop={movesPop > 0}>{game.moves ? game.moves.left : '–'}</span>
				{/key}
			</div>
			<div class="stat">
				<span class="lbl">{t('hud.length')}</span>
				<span class="val num">{game.snakeLen}</span>
			</div>
			<div class="stat mult">
				<span class="lbl">{t('hud.multiplier')}</span>
				{#key slam}
					<span class="val num m" class:pop={slam > 0} class:big>×{game.snakeMult}</span>
				{/key}
			</div>
		</div>
	{/if}
	{#if showWin}
		<div class="win deco">
			<span class="lbl">{t('hud.win')}</span>
			<span class="val num">{money(game.totalWin)}</span>
		</div>
	{/if}
</div>

<style>
	.hud {
		display: flex;
		gap: clamp(8px, 1.6vh, 16px);
		pointer-events: none;
		color: var(--ivory);
	}
	.hud.side {
		flex-direction: column;
		align-items: stretch;
		width: 100%;
	}
	.hud.top {
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
	}
	/* free-spin counter: a deco plaque (cut corners, brass edge), venom-green edge in VENOM HUNT */
	.fs {
		--cut: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 22px 9px;
	}
	.fs.venom::before {
		background: linear-gradient(160deg, #b8ffd6 0%, #1fbf62 45%, #7dffb4 70%, #0c6b34 100%);
	}
	.fs-title {
		font-size: clamp(14px, 2.8vh, 24px);
		color: var(--brass-hi);
		letter-spacing: 0.12em;
	}
	.fs.venom .fs-title {
		color: var(--venom);
	}
	.fs-win {
		font-size: clamp(12px, 2.2vh, 18px);
		font-weight: 700;
	}
	/* MOVES · LENGTH · MULTIPLIER share one plaque, split by hairlines (not three separate boxes) */
	.stats {
		--cut: 9px;
		display: flex;
		justify-content: center;
		padding: 5px 4px;
	}
	.side .stats {
		flex-direction: column;
		padding: 4px 10px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 64px;
		padding: 0 12px;
	}
	.stat + .stat {
		border-left: 1px solid var(--rule);
	}
	.side .stat {
		padding: 5px 0;
	}
	.side .stat + .stat {
		border-left: 0;
		border-top: 1px solid var(--rule);
	}
	.lbl {
		font-size: clamp(8px, 1.3vh, 11px);
		letter-spacing: 0.18em;
		color: var(--ivory-dim);
	}
	.val {
		font-size: clamp(15px, 3vh, 26px);
		font-weight: 800;
		line-height: 1.05;
	}
	.mv.pop {
		display: inline-block;
		animation: pop 420ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
	}
	.m {
		color: var(--brass-hi);
		display: inline-block;
	}
	.m.pop {
		animation: pop 380ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
	}
	.m.pop.big {
		animation: popbig 700ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
		color: var(--venom);
	}
	.win {
		--cut: 9px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 5px 14px;
	}
	.win .val {
		font-size: clamp(13px, 2.4vh, 20px);
		font-weight: 700;
	}
	@keyframes pop {
		0% {
			transform: scale(1.5);
		}
		100% {
			transform: scale(1);
		}
	}
	@keyframes popbig {
		0% {
			transform: scale(2.2);
		}
		60% {
			color: var(--venom);
		}
		100% {
			transform: scale(1);
			color: var(--brass-hi);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.m.pop,
		.m.pop.big {
			animation: none;
		}
	}
</style>
