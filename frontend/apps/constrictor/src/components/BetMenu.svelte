<!-- Every bet level from authenticate, min to max. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import { game } from '$game/state/game.svelte';
	import { t } from '$game/i18n';
	import { formatMoney } from '$game/money';

	type Props = { onClose: () => void; onPick: (v: number) => void };
	let { onClose, onPick }: Props = $props();
</script>

<Modal title={t('hud.bet')} {onClose}>
	<div class="levels">
		{#each game.betLevels as v}
			<button class="lvl num" class:on={v === game.bet} aria-pressed={v === game.bet} onclick={() => onPick(v)}>{formatMoney(v, game.currency)}</button>
		{/each}
	</div>
</Modal>

<style>
	.levels {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
		gap: 6px;
	}
	.lvl {
		min-height: 38px;
		border: 2px solid var(--ink);
		border-radius: 12px;
		background: transparent;
		color: var(--ink);
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
	}
	.lvl:hover,
	.lvl:focus-visible {
		background: rgba(17, 17, 17, 0.1);
		outline: none;
	}
	.lvl.on {
		background: var(--ink);
		color: var(--paper);
		box-shadow: inset 0 0 0 2px var(--paper);
	}
</style>
