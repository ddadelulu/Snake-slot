<!--
	Floating "Buy Bonus" button above the taskbar (owner's layout): a solid brass ticket with cut corners; opens a
	list with the bonus buys (price at the current bet) and the SERPENT CALL switch. A buy only asks for confirmation; the round is
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
	<div class="popup deco" class:active={open} role="menu" aria-label={label} inert={!open}>
		{#each items as it (it.id)}
			<button class="item" role="menuitem" data-mode={it.id} {disabled} onclick={() => ((open = false), onPick(it.id))}>
				<span class="main">{it.label}</span>
				<span class="price num">{it.price}</span>
			</button>
		{/each}
		<button class="item ante" class:on={anteOn} role="menuitemcheckbox" aria-checked={anteOn} data-act="ante" disabled={anteDisabled} onclick={() => ((open = false), onAnte())}>
			<span class="main">{anteLabel}</span>
			<span class="price num">{anteSub}</span>
		</button>
	</div>
	<div class="buttons">
		<button class="buy-bonus deco brass" aria-haspopup="menu" aria-expanded={open} disabled={disabled && anteDisabled} onclick={() => (open = !open)}>{label}</button>
		{#if anteOn}<span class="chip deco">{anteChip}</span>{/if}
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
	/* the ticket: solid brass, cut corners, dark engraved letters */
	.buy-bonus {
		--cut: 9px;
		padding: 9px 20px 8px;
		font-weight: 900;
		font-size: 14px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		white-space: nowrap;
		color: #1a1208;
		text-shadow: 0 1px 0 rgba(255, 240, 200, 0.45);
	}
	.chip {
		--cut: 6px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--gold-text);
		padding: 5px 10px;
		white-space: nowrap;
	}
	/* the list: one deco panel, rows split by hairlines */
	.popup {
		--cut: 12px;
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		width: 270px;
		padding: 8px 6px;
		display: flex;
		flex-direction: column;
		opacity: 0;
		pointer-events: none;
		transform: translateY(8px);
		transition: opacity 0.25s ease, transform 0.25s ease;
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
		background: transparent;
		border: 0;
		padding: 11px 12px;
		font-weight: 800;
		font-size: 14px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.item + .item {
		border-top: 1px solid var(--rule);
	}
	.item .price {
		font-size: 13px;
		letter-spacing: 0.02em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--ink);
	}
	.item.ante .price {
		color: var(--gold-text);
	}
	.item.ante.on .price {
		color: var(--venom);
	}
	@media (hover: hover) {
		.item:hover:not(:disabled) {
			background: var(--hover);
		}
		.buy-bonus:hover:not(:disabled) {
			filter: var(--ink-outline) var(--ink-drop) brightness(1.08);
		}
	}
	.compact .buy-bonus {
		--cut: 7px;
		padding: 6px 12px 5px;
		font-size: 11px;
	}
	.compact .popup {
		width: 210px;
		padding: 4px;
	}
	.compact .item {
		padding: 7px 8px;
		font-size: 11px;
	}
	.compact .item .price {
		font-size: 11px;
	}
	.compact .chip {
		font-size: 9px;
		padding: 4px 7px;
	}
	@media (prefers-reduced-motion: reduce) {
		.popup {
			transition: none;
		}
	}
</style>
