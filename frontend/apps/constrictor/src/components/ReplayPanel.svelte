<!-- Bet replay (REQUIREMENTS §6): mode, bet, cost multiplier, real cost; play / play again. There is no way
     to start normal play from here. -->
<script lang="ts">
	import { game } from '$game/state/game.svelte';
	import { t } from '$game/i18n';
	import { formatMoney } from '$game/money';

	type Props = { onPlay: () => void };
	let { onPlay }: Props = $props();
	const r = $derived(game.replay);
	const modeName = (m: string) => {
		const k = `mode.${m}`;
		const s = t(k);
		return s === k ? m.toUpperCase() : s;
	};
</script>

{#if game.phase === 'loading'}
	<div class="panel on-glass"><p>{t('replay.loading')}</p></div>
{:else if game.phase === 'error'}
	<div class="panel on-glass"><p>{t('replay.error')}</p></div>
{:else if r && (game.phase === 'replayReady' || game.phase === 'replayDone')}
	<div class="panel on-glass">
		<h2 class="display">{t('replay.title')}</h2>
		<dl>
			<dt>{t('replay.mode')}</dt>
			<dd>{modeName(r.mode)}</dd>
			<dt>{t('replay.bet')}</dt>
			<dd class="num">{formatMoney(r.betRaw, game.currency)}</dd>
			<dt>{t('replay.costMultiplier')}</dt>
			<dd class="num">{r.costMultiplier}×</dd>
			<dt>{t('replay.realCost')}</dt>
			<dd class="num">{formatMoney(Math.round(r.betRaw * r.costMultiplier), game.currency)}</dd>
			{#if game.phase === 'replayDone'}
				<dt>{t('replay.win')}</dt>
				<dd class="num">{formatMoney(Math.round(r.betRaw * r.payoutMultiplier), game.currency)}</dd>
			{/if}
		</dl>
		<button class="btn primary" onclick={onPlay}>{game.phase === 'replayDone' ? t('button.playAgain') : t('button.play')}</button>
	</div>
{/if}

<style>
	.panel {
		position: fixed;
		left: 50%;
		bottom: calc(16px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		z-index: 20;
		width: min(92vw, 420px);
		padding: 14px 18px;
		background: var(--glass-strong);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--edge);
		border-radius: 24px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: auto;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		color: var(--brass-hi);
		letter-spacing: 0.14em;
	}
	p {
		margin: 0;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 12px;
		margin: 0;
		font-size: 13px;
	}
	dt {
		color: var(--ivory-dim);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		align-self: center;
	}
	dd {
		margin: 0;
		text-align: right;
		font-weight: 700;
	}
</style>
