<!--
	BALANCE and WIN beside the taskbar (Stake requires both on screen at all times). A small card in the taskbar's
	style that mirrors the Buy Bonus button: bottom right where Buy Bonus is bottom left, so the dock keeps the
	owner's exact layout. `stack` puts the two readouts on top of each other (narrow side panels).
-->
<script lang="ts">
	type Props = {
		balanceLabel: string;
		winLabel: string;
		balanceText: string;
		winText: string;
		showBalance?: boolean;
		showWin?: boolean;
		stack?: boolean;
		compact?: boolean;
	};
	let { balanceLabel, winLabel, balanceText, winText, showBalance = true, showWin = true, stack = false, compact = false }: Props = $props();
</script>

{#if showBalance || showWin}
	<div class="readouts" class:stack class:compact>
		{#if showBalance}
			<div class="readout" aria-live="polite"><span class="lbl">{balanceLabel}</span><span class="val num">{balanceText}</span></div>
		{/if}
		{#if showBalance && showWin}<span class="sep" aria-hidden="true"></span>{/if}
		{#if showWin}
			<div class="readout win" aria-live="polite"><span class="lbl">{winLabel}</span><span class="val num">{winText}</span></div>
		{/if}
	</div>
{/if}

<style>
	.readouts {
		display: inline-flex;
		align-items: center;
		gap: 14px;
		padding: 7px 18px;
		background: var(--glass);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 2px solid var(--edge);
		border-radius: 16px;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
		font-family: var(--font-ui);
		pointer-events: none;
		user-select: none;
		max-width: 100%;
	}
	.readout {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
		min-width: 0;
	}
	.readout.win {
		align-items: flex-end;
	}
	.lbl {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold-text);
	}
	.val {
		font-size: clamp(14px, 2.6vh, 19px);
		font-weight: 800;
		color: var(--ink);
		white-space: nowrap;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.sep {
		width: 1px;
		align-self: stretch;
		background: var(--rule);
	}
	.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		padding: 6px 12px;
	}
	.stack .readout.win {
		align-items: flex-start;
	}
	.stack .sep {
		width: auto;
		height: 1px;
	}
	.compact {
		padding: 4px 8px;
		border-radius: 12px;
	}
	.compact .lbl {
		font-size: 8px;
	}
	.compact .val {
		font-size: 12px;
	}
</style>
