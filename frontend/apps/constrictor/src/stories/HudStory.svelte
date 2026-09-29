<script lang="ts">
	import Hud from '$components/Hud.svelte';
	import Logo from '$components/Logo.svelte';
	import { game } from '$game/state/game.svelte';

	type Props = { layout: 'side' | 'top'; feature: 'hunt' | 'venom' | null; fsCurrent: number; fsTotal: number; moves: number; length: number; mult: number; featureWinX: number; idle?: boolean };
	let p: Props = $props();
	$effect(() => {
		game.currency = 'USD';
		game.roundBet = 1_000_000;
		game.feature = p.feature;
		game.fs = p.feature ? { current: p.fsCurrent, total: p.fsTotal } : null;
		game.moves = { left: p.moves, total: 12 };
		game.snakeLen = p.length;
		game.snakeMult = p.mult;
		game.featureWin = Math.round(p.featureWinX * 100);
		game.totalWin = game.featureWin;
	});
</script>

<div class="wrap {p.layout}">
	{#if p.idle}<Logo />{:else}<Hud layout={p.layout} showWin />{/if}
</div>

<style>
	.wrap {
		min-height: 100vh;
		background: radial-gradient(ellipse at center, #1b1d21, #07080a);
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.wrap.side :global(.hud) {
		width: 220px;
	}
</style>
