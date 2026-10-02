<!-- Brass plaque on the board's top rail: MOVES counter and the snake status line (LENGTH · ×mult). -->
<script lang="ts">
	import { game } from '$game/state/game.svelte';
	import { eventEmitter } from '$game/emitter';
	import { t } from '$game/i18n';

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
</script>

<div class="plaque deco on-glass" aria-live="polite">
	<span class="grp">
		<span class="lbl">{t('hud.moves')}</span>
		{#key movesPop}<span class="val num mv" class:pop={movesPop > 0}>{game.moves ? game.moves.left : '–'}</span>{/key}
	</span>
	<span class="sep" aria-hidden="true"></span>
	<span class="grp">
		<span class="lbl">{t('hud.length')}</span>
		<span class="val num">{game.snakeLen}</span>
		<span class="dot" aria-hidden="true">·</span>
		{#key slam}<span class="val num mult" class:pop={slam > 0} class:big>×{game.snakeMult}</span>{/key}
	</span>
</div>

<style>
	.plaque {
		--cut: 8px;
		display: inline-flex;
		align-items: center;
		gap: clamp(8px, 1.4vw, 16px);
		padding: 5px clamp(14px, 2vw, 22px);
		pointer-events: none;
		white-space: nowrap;
	}
	.grp {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}
	.lbl {
		font-size: clamp(8px, 1.3vh, 11px);
		font-weight: 800;
		letter-spacing: 0.2em;
		color: var(--ivory-dim);
	}
	.val {
		font-family: var(--font-ui);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		font-size: clamp(14px, 2.6vh, 22px);
		line-height: 1;
		color: var(--ivory);
		display: inline-block;
	}
	.mult {
		color: var(--brass-hi);
	}
	.dot {
		color: var(--brass);
	}
	.sep {
		width: 1px;
		align-self: stretch;
		background: var(--rule);
	}
	.pop {
		animation: pop 380ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
	}
	.mult.pop.big {
		animation: popbig 700ms cubic-bezier(0.2, 1.6, 0.4, 1) both;
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
			color: var(--venom);
		}
		100% {
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop,
		.mult.pop.big {
			animation: none;
		}
	}
</style>
