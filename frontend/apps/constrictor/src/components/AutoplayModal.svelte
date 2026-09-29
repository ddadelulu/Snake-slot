<!-- Autoplay setup. Pressing START is the player's confirmation; autoplay never starts on its own. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import { game } from '$game/state/game.svelte';
	import { t } from '$game/i18n';
	import { formatMoney } from '$game/money';
	import type { AutoplaySettings } from '$game/round';

	type Props = { onClose: () => void; onStart: (s: AutoplaySettings) => void };
	let { onClose, onStart }: Props = $props();

	const SPINS = [10, 25, 50, 100, 250, 500, 1000];
	const WIN_X = [null, 10, 50, 100, 500];
	const BAL_X = [null, 10, 25, 50, 100, 250];
	let spins = $state(25);
	let stopOnFeature = $state(true);
	let winX = $state<number | null>(null);
	let upX = $state<number | null>(null);
	let downX = $state<number | null>(null);

	const off = t('autoplay.off');
	const bet = game.spinCost;
	const moneyX = (x: number | null) => (x === null ? off : formatMoney(bet * x, game.currency));

	function start() {
		onStart({
			spins,
			stopOnFeature,
			stopOnWinX: winX,
			stopBalanceUp: upX === null ? null : bet * upX,
			stopBalanceDown: downX === null ? null : bet * downX,
		});
	}
</script>

<Modal title={t('autoplay.title')} {onClose}>
	<fieldset>
		<legend>{t('autoplay.spins')}</legend>
		<div class="chips">
			{#each SPINS as n}
				<button class="chip num" class:on={spins === n} aria-pressed={spins === n} onclick={() => (spins = n)}>{n}</button>
			{/each}
		</div>
	</fieldset>
	<label class="row">
		<input type="checkbox" bind:checked={stopOnFeature} />
		<span>{t('autoplay.stopFeature')}</span>
	</label>
	<label class="row">
		<span>{t('autoplay.stopWin')}</span>
		<select bind:value={winX}>
			{#each WIN_X as x}<option value={x}>{x === null ? off : `${x}×`}</option>{/each}
		</select>
	</label>
	<label class="row">
		<span>{t('autoplay.stopBalanceUp')}</span>
		<select bind:value={upX}>
			{#each BAL_X as x}<option value={x}>{moneyX(x)}</option>{/each}
		</select>
	</label>
	<label class="row">
		<span>{t('autoplay.stopBalanceDown')}</span>
		<select bind:value={downX}>
			{#each BAL_X as x}<option value={x}>{moneyX(x)}</option>{/each}
		</select>
	</label>
	{#snippet footer()}
		<button class="btn" onclick={onClose}>{t('button.cancel')}</button>
		<button class="btn primary" onclick={start}>{t('autoplay.start')}</button>
	{/snippet}
</Modal>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 12px;
	}
	legend {
		font-size: 11px;
		letter-spacing: 0.16em;
		color: var(--ivory-dim);
		text-transform: uppercase;
		margin-bottom: 6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		min-width: 46px;
		height: 34px;
		border: 1px solid var(--gunmetal);
		background: none;
		color: var(--ivory);
		font-weight: 700;
		cursor: pointer;
	}
	.chip.on {
		background: var(--brass-hi);
		border-color: var(--brass-hi);
		color: #0b0b0c;
	}
	.chip:focus-visible {
		outline: 1px solid var(--brass-hi);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 7px 0;
		border-top: 1px solid rgba(42, 46, 51, 0.7);
	}
	input[type='checkbox'] {
		accent-color: #d9b26f;
		width: 18px;
		height: 18px;
		order: 2;
	}
	select {
		background: #0e0f11;
		color: var(--ivory);
		border: 1px solid var(--gunmetal);
		padding: 6px 8px;
		font: inherit;
		min-width: 96px;
	}
</style>
