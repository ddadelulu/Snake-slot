<!--
	The game's taskbar, laid out exactly as the owner's design (slot_layout.html): a floating glass dock with the
	menu button on the left, SPIN in the middle and − BET + on the right, in black with gold outlines and the game's
	fonts. The menu opens a popup (auto spin, speed, sound, rules, settings). BALANCE and WIN are shown by
	Readouts.svelte beside the dock (Stake requirement), so the dock itself stays as designed.
	Layouts only change sizes: wide (desktop), compact (mini-player / narrow landscape), stacked (phones).
-->
<script lang="ts">
	type Labels = {
		bet: string;
		spin: string;
		skip: string;
		stop: string;
		betDown: string;
		betUp: string;
		menu: string;
		auto: string;
		speed: string;
		sound: string;
		rules: string;
		settings: string;
	};

	type Props = {
		labels: Labels;
		layout: 'wide' | 'stacked' | 'compact';
		betText: string;
		spinState: 'idle' | 'busy' | 'auto' | 'disabled';
		autoText?: string | null;
		showBet?: boolean;
		showSpin?: boolean;
		showAuto?: boolean;
		showSpeed?: boolean;
		canBetDown?: boolean;
		canBetUp?: boolean;
		onSpin: () => void;
		onStop: () => void;
		onBetDown: () => void;
		onBetUp: () => void;
		onBetOpen: () => void;
		onAuto: () => void;
		onSpeed: () => void;
		onSound: () => void;
		onRules: () => void;
		onSettings: () => void;
	};

	let {
		labels,
		layout,
		betText,
		spinState,
		autoText = null,
		showBet = true,
		showSpin = true,
		showAuto = true,
		showSpeed = true,
		canBetDown = true,
		canBetUp = true,
		onSpin,
		onStop,
		onBetDown,
		onBetUp,
		onBetOpen,
		onAuto,
		onSpeed,
		onSound,
		onRules,
		onSettings,
	}: Props = $props();

	let menuOpen = $state(false);
	let wrap: HTMLDivElement | undefined = $state();
	const busy = $derived(spinState === 'busy');
	const auto = $derived(spinState === 'auto');
	const locked = $derived(busy || auto);

	// close the menu on any press outside it
	$effect(() => {
		if (!menuOpen) return;
		const close = (e: PointerEvent) => {
			if (wrap && !wrap.contains(e.target as Node)) menuOpen = false;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') menuOpen = false;
		};
		window.addEventListener('pointerdown', close, true);
		window.addEventListener('keydown', esc);
		return () => {
			window.removeEventListener('pointerdown', close, true);
			window.removeEventListener('keydown', esc);
		};
	});

	// SPIN sits exactly in the middle whenever − BET + fits beside it; otherwise (tiny phones, long amounts) the
	// dock falls back to the owner's small-screen rule and spreads the three groups out
	let dockEl: HTMLDivElement | undefined = $state();
	let spinEl: HTMLButtonElement | undefined = $state();
	let betEl: HTMLDivElement | undefined = $state();
	let tight = $state(false);
	function measure() {
		if (!dockEl || !betEl) return void (tight = false);
		const cs = getComputedStyle(dockEl);
		const inner = dockEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
		const gap = parseFloat(cs.columnGap) || 0;
		const side = (inner - (spinEl?.offsetWidth ?? 0) - 2 * gap) / 2;
		tight = betEl.offsetWidth > side;
	}
	$effect(() => {
		void betText;
		void layout;
		measure();
	});
	$effect(() => {
		if (!dockEl || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(dockEl);
		return () => ro.disconnect();
	});

	function pick(fn: () => void, keepOpen = false) {
		fn();
		if (!keepOpen) menuOpen = false;
	}
</script>

<div class="tb-wrap {layout}" bind:this={wrap}>
	<div class="popup" class:active={menuOpen} role="menu" aria-label={labels.menu} inert={!menuOpen}>
		{#if showAuto}
			<button class="btn" role="menuitem" data-act="auto" onclick={() => pick(auto ? onStop : onAuto)}>{labels.auto}</button>
		{/if}
		{#if showSpeed}
			<button class="btn" role="menuitem" data-act="speed" onclick={() => pick(onSpeed, true)}>{labels.speed}</button>
		{/if}
		<button class="btn" role="menuitem" data-act="sound" onclick={() => pick(onSound, true)}>{labels.sound}</button>
		<button class="btn" role="menuitem" data-act="rules" onclick={() => pick(onRules)}>{labels.rules}</button>
		<button class="btn" role="menuitem" data-act="settings" onclick={() => pick(onSettings)}>{labels.settings}</button>
	</div>

	<div class="dock" class:tight bind:this={dockEl} role="toolbar" aria-label="Game controls">
		<div class="side left">
			<button class="menu-btn" class:open={menuOpen} aria-label={labels.menu} aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
				<span></span><span></span><span></span>
			</button>
		</div>

		<div class="center">
			{#if showSpin}
				<button
					bind:this={spinEl}
					class="spin"
					class:busy
					class:auto
					disabled={spinState === 'disabled'}
					aria-label={auto ? labels.stop : busy ? labels.skip : labels.spin}
					onclick={() => (auto ? onStop() : onSpin())}
				>
					{auto ? (autoText ?? labels.stop) : labels.spin}
				</button>
			{/if}
		</div>

		<div class="side right">
			{#if showBet}
				<div class="bet" bind:this={betEl}>
					<button class="adjust" aria-label={labels.betDown} disabled={!canBetDown || locked} onclick={onBetDown}>&minus;</button>
					<button class="betval" aria-label={labels.bet} disabled={locked} onclick={onBetOpen}>
						<span class="lbl">{labels.bet}</span>
						<span class="val num">{betText}</span>
					</button>
					<button class="adjust" aria-label={labels.betUp} disabled={!canBetUp || locked} onclick={onBetUp}>&plus;</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.tb-wrap {
		--spin-font: clamp(20px, 3.8vh, 28px);
		--spin-pad: clamp(8px, 1.5vh, 14px) clamp(28px, 4vw, 45px);
		--adj: 40px;
		--amount: 24px;
		--dock-radius: 30px;
		position: relative;
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
		padding: 0 16px 12px;
		box-sizing: border-box;
		font-family: var(--font-ui);
		color: var(--gold-text);
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	/* the owner's dock: glass, heavy outline, round corners; equal sides keep SPIN exactly in the middle */
	.dock {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		background: var(--glass);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--edge);
		border-radius: var(--dock-radius);
		padding: 10px 20px;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.45);
	}
	.dock.tight {
		display: flex;
		justify-content: space-between;
	}
	.side {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.side.right {
		justify-content: flex-end;
	}
	.center {
		display: flex;
		justify-content: center;
	}

	button {
		font-family: var(--font-ui);
		color: var(--gold-text);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.4;
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
		font-size: 14px;
		letter-spacing: 1px;
		text-transform: uppercase;
		text-align: left;
		width: 100%;
		transition: background 0.2s ease, color 0.2s ease;
	}
	.menu-btn {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		width: 45px;
		height: 40px;
		flex: 0 0 auto;
		background: transparent;
		border: 2px solid transparent;
		border-radius: 14px;
		padding: 8px 6px;
		transition: border-color 0.2s;
	}
	.menu-btn span {
		display: block;
		width: 100%;
		height: 3px;
		background: var(--edge);
		border-radius: 4px;
	}
	.menu-btn.open {
		border-color: var(--edge);
	}
	/* SPIN: the owner's filled button with a double border, in gold on black */
	.spin {
		font-family: var(--font-display);
		font-size: var(--spin-font);
		font-weight: 900;
		letter-spacing: 0.08em;
		line-height: 1;
		padding: var(--spin-pad);
		background: var(--accent);
		color: var(--paper);
		border: 3px solid var(--edge);
		border-radius: 24px;
		box-shadow: inset 0 0 0 2px var(--paper);
		white-space: nowrap;
		transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 90ms;
	}
	.spin:active:not(:disabled) {
		transform: scale(0.97);
	}
	.spin.busy {
		background: transparent;
		color: var(--gold-text);
		box-shadow: none;
	}
	.spin.auto {
		font-size: calc(var(--spin-font) * 0.72);
		background: var(--paper);
		color: var(--gold-text);
	}
	.bet {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 0 0 auto;
	}
	.adjust {
		width: var(--adj);
		height: var(--adj);
		flex: 0 0 auto;
		border-radius: 50%;
		border: 2px solid var(--edge);
		background: transparent;
		padding: 0;
		display: grid;
		place-items: center;
		font-size: calc(var(--adj) * 0.6);
		font-weight: 800;
		line-height: 1;
		transition: background 0.2s ease, color 0.2s ease;
	}
	.betval {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 90px;
		background: none;
		border: 0;
		padding: 0;
		line-height: 1.1;
	}
	.lbl {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 2px;
		text-transform: uppercase;
		margin-bottom: 2px;
	}
	.val {
		font-size: var(--amount);
		font-weight: 800;
		color: var(--ink);
		white-space: nowrap;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	@media (hover: hover) {
		.btn:hover,
		.adjust:hover:not(:disabled) {
			background: var(--accent);
			color: var(--paper);
		}
		.menu-btn:hover {
			border-color: var(--edge);
		}
		.spin:hover:not(:disabled):not(.busy) {
			background: transparent;
			color: var(--gold-text);
			box-shadow: none;
		}
	}

	/* menu popup (opens above the menu button) */
	.popup {
		position: absolute;
		left: 16px;
		bottom: calc(100% + 6px);
		min-width: 190px;
		background: var(--glass-strong);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--edge);
		border-radius: 20px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
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

	/* phones: the owner's small-screen sizes */
	.stacked {
		--spin-font: 20px;
		--spin-pad: 10px 15px;
		--adj: 32px;
		--amount: 17px;
		--dock-radius: 26px;
		padding: 0 10px calc(8px + env(safe-area-inset-bottom));
	}
	.stacked .dock {
		padding: 10px 8px;
		gap: 4px;
	}
	.stacked .bet {
		gap: 4px;
	}
	.stacked .betval {
		min-width: 50px;
	}
	.stacked .lbl {
		font-size: 10px;
		letter-spacing: 1.5px;
	}
	.stacked .popup {
		left: 10px;
	}
	/* very small phones: as in the owner's file, the strict centring gives way so everything fits */
	@media (max-width: 359px) {
		.stacked {
			--spin-pad: 9px 13px;
			--adj: 30px;
			--amount: 15px;
		}
		.stacked .menu-btn {
			width: 38px;
		}
		.stacked .betval {
			min-width: 50px;
		}
	}

	/* mini-player: one slim row */
	.compact {
		--spin-font: 16px;
		--spin-pad: 6px 18px;
		--adj: 28px;
		--amount: 14px;
		--dock-radius: 20px;
		padding: 0 6px 5px;
	}
	.compact .dock {
		padding: 4px 10px;
		border-width: 2px;
		gap: 6px;
	}
	.compact .menu-btn {
		width: 32px;
		height: 28px;
		padding: 5px 4px;
	}
	.compact .menu-btn span {
		height: 2px;
	}
	.compact .spin {
		border-width: 2px;
		border-radius: 16px;
	}
	.compact .lbl {
		font-size: 8px;
		margin-bottom: 0;
	}
	.compact .bet {
		gap: 4px;
	}
	.compact .betval {
		min-width: 50px;
	}
	.compact .popup {
		left: 6px;
		padding: 8px;
		gap: 5px;
		min-width: 160px;
	}
	.compact .btn {
		padding: 5px 10px;
		font-size: 11px;
	}

	@media (prefers-reduced-motion: reduce) {
		.popup,
		.spin,
		.btn,
		.adjust {
			transition: none;
		}
	}
</style>
