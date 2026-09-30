<!--
	Floating "Buy Bonus" button above the taskbar (owner's layout): dashed, italic, opens a popup with the bonus
	buys (price at the current bet) and the SERPENT CALL switch. A buy only asks for confirmation; the round is
	played by the caller. When SERPENT CALL is on, a chip beside the button says so.
-->
<script lang="ts">
	type Item = { id: string; label: string; price: string };
	type Props = {
		label: string;
		items: Item[];
		anteLabel: string;
		anteSub: string;
		anteOn: boolean;
		anteChip: string;
		disabled?: boolean;
		anteDisabled?: boolean;
		compact?: boolean;
		onPick: (id: string) => void;
		onAnte: () => void;
	};
	let { label, items, anteLabel, anteSub, anteOn, anteChip, disabled = false, anteDisabled = false, compact = false, onPick, onAnte }: Props = $props();

	let open = $state(false);
	let wrap: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (disabled && anteDisabled) open = false;
	});
	$effect(() => {
		if (!open) return;
		const close = (e: PointerEvent) => {
			if (wrap && !wrap.contains(e.target as Node)) open = false;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		window.addEventListener('pointerdown', close, true);
		window.addEventListener('keydown', esc);
		return () => {
			window.removeEventListener('pointerdown', close, true);
			window.removeEventListener('keydown', esc);
		};
	});
</script>

<div class="bonus" class:compact bind:this={wrap}>
	<div class="popup" class:active={open} role="menu" aria-label={label} inert={!open}>
		{#each items as it (it.id)}
			<button class="btn item" role="menuitem" data-mode={it.id} {disabled} onclick={() => ((open = false), onPick(it.id))}>
				<span class="main">{it.label}</span>
				<span class="price num">{it.price}</span>
			</button>
		{/each}
		<button class="btn item ante" class:on={anteOn} role="menuitemcheckbox" aria-checked={anteOn} data-act="ante" disabled={anteDisabled} onclick={() => ((open = false), onAnte())}>
			<span class="main">{anteLabel}</span>
			<span class="price num">{anteSub}</span>
		</button>
	</div>
	<div class="buttons">
		<button class="btn buy-bonus" aria-haspopup="menu" aria-expanded={open} disabled={disabled && anteDisabled} onclick={() => (open = !open)}>{label}</button>
		{#if anteOn}<span class="chip">{anteChip}</span>{/if}
	</div>
</div>

<style>
	.bonus {
		position: relative;
		font-family: var(--font-ui);
		color: var(--gold-text);
		pointer-events: auto;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.buttons {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	button {
		font-family: var(--font-ui);
		color: var(--gold-text);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 3px;
	}
	.btn {
		background: transparent;
		border: 2px solid var(--edge);
		border-radius: 14px;
		padding: 8px 16px;
		font-weight: 800;
		font-size: 15px;
		letter-spacing: 1px;
		text-transform: uppercase;
		transition: background 0.2s ease, color 0.2s ease, border-style 0.2s;
	}
	.buy-bonus {
		font-style: italic;
		border-style: dashed;
		background: var(--glass);
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
		white-space: nowrap;
	}
	.chip {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: var(--glass);
		color: var(--gold-text);
		border: 2px solid var(--edge);
		border-radius: 999px;
		padding: 4px 10px;
		white-space: nowrap;
	}
	.popup {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		width: 270px;
		background: var(--glass-strong);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--edge);
		border-radius: 20px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
		opacity: 0;
		pointer-events: none;
		transform: translateY(10px);
		transition: opacity 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		z-index: 20;
	}
	.popup.active {
		opacity: 1;
		pointer-events: auto;
		transform: translateY(0);
	}
	.item {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		width: 100%;
		text-align: left;
	}
	.item .price {
		font-size: 13px;
		letter-spacing: 0.02em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.item.ante {
		border-style: dashed;
	}
	.item.ante.on {
		border-style: solid;
		background: var(--accent);
		color: var(--paper);
	}
	@media (hover: hover) {
		.btn:hover:not(:disabled) {
			background: var(--accent);
			color: var(--paper);
		}
		.buy-bonus:hover:not(:disabled) {
			border-style: solid;
		}
	}
	.compact .btn {
		padding: 5px 10px;
		font-size: 11px;
		border-radius: 12px;
	}
	.compact .popup {
		width: 210px;
		padding: 8px;
		gap: 5px;
	}
	.compact .item .price {
		font-size: 11px;
	}
	.compact .chip {
		font-size: 9px;
		padding: 3px 7px;
	}
	@media (prefers-reduced-motion: reduce) {
		.popup,
		.btn {
			transition: none;
		}
	}
</style>
