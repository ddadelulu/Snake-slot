<!--
	The game's taskbar, laid out as the owner's design (slot_layout.html): a floating glass dock with the menu
	button on the left, SPIN in the middle and − BET + on the right, in black with gold outlines and the game's
	fonts. The menu opens a popup (auto spin, speed, sound, rules, settings). BALANCE and WIN (always on screen,
	a Stake requirement) live in the dock where a slot player looks for them: beside the menu, mirroring BET, on
	wide screens; on phones as a slim row along the bottom of the dock.
	Layouts only change sizes: wide (desktop), compact (mini-player / narrow landscape), stacked (phones).
-->
<script lang="ts">
	type Labels = {
		bet: string;
		balance: string;
		win: string;
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
		balanceText: string;
		winText: string;
		showBalance?: boolean;
		showWin?: boolean;
		/** true while the round has a win: the WIN amount lights up gold */
		winHot?: boolean;
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
		balanceText,
		winText,
		showBalance = true,
		showWin = true,
		winHot = false,
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
	let rowEl: HTMLDivElement | undefined = $state();
	let spinEl: HTMLButtonElement | undefined = $state();
	let betEl: HTMLDivElement | undefined = $state();
	let leftEl: HTMLDivElement | undefined = $state();
	let tight = $state(false);
	function measure() {
		if (!rowEl) return void (tight = false);
		const cs = getComputedStyle(rowEl);
		const inner = rowEl.clientWidth;
		const gap = parseFloat(cs.columnGap) || 0;
		const side = (inner - (spinEl?.offsetWidth ?? 0) - 2 * gap) / 2;
		tight = Math.max(betEl?.offsetWidth ?? 0, leftEl?.offsetWidth ?? 0) > side;
	}
	$effect(() => {
		void betText;
		void balanceText;
		void winText;
		void layout;
		measure();
	});
	$effect(() => {
		if (!rowEl || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(rowEl);
		return () => ro.disconnect();
	});
	const fundsInRow = $derived(layout === 'stacked');

	function pick(fn: () => void, keepOpen = false) {
		fn();
		if (!keepOpen) menuOpen = false;
	}
</script>

<div class="tb-wrap {layout}" bind:this={wrap}>
	<div class="popup deco" class:active={menuOpen} role="menu" aria-label={labels.menu} inert={!menuOpen}>
		{#if showAuto}
			<button class="item" role="menuitem" data-act="auto" onclick={() => pick(auto ? onStop : onAuto)}>{labels.auto}</button>
		{/if}
		{#if showSpeed}
			<button class="item" role="menuitem" data-act="speed" onclick={() => pick(onSpeed, true)}>{labels.speed}</button>
		{/if}
		<button class="item" role="menuitem" data-act="sound" onclick={() => pick(onSound, true)}>{labels.sound}</button>
		<button class="item" role="menuitem" data-act="rules" onclick={() => pick(onRules)}>{labels.rules}</button>
		<button class="item" role="menuitem" data-act="settings" onclick={() => pick(onSettings)}>{labels.settings}</button>
	</div>

	{#snippet funds()}
		{#if showBalance}
			<div class="readout" aria-live="polite"><span class="lbl">{labels.balance}</span><span class="val num">{balanceText}</span></div>
		{/if}
		{#if showWin}
			<div class="readout win" class:hot={winHot} aria-live="polite"><span class="lbl">{labels.win}</span><span class="val num">{winText}</span></div>
		{/if}
	{/snippet}
	<div class="dock" role="toolbar" aria-label="Game controls">
		<!-- smoked glass (the room shows through, softly blurred) inside a brass rim -->
		<span class="glass" aria-hidden="true"></span>
		<span class="rim" aria-hidden="true"><span></span></span>
		<div class="row" class:tight bind:this={rowEl}>
		<div class="side left">
			<div class="left-group" bind:this={leftEl}>
				<button class="menu-btn" class:open={menuOpen} aria-label={labels.menu} aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
					<span></span><span></span><span></span>
				</button>
				{#if !fundsInRow && (showBalance || showWin)}
					<div class="funds">{@render funds()}</div>
				{/if}
			</div>
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
					{#if auto}
						<span class="spin-auto">{autoText ?? labels.stop}</span>
					{:else}
						<!-- two chasing arrows, engraved into the brass -->
						<svg class="spin-icon" viewBox="0 0 48 48" aria-hidden="true">
							<g fill="none" stroke="currentColor" stroke-width="4.6" stroke-linecap="round">
								<path d="M38 20a15 15 0 0 0-26.5-5" />
								<path d="M10 28a15 15 0 0 0 26.5 5" />
							</g>
							<g fill="currentColor">
								<path d="M7.6 12.2 15.6 17.4 7.4 21.4Z" />
								<path d="M40.4 35.8 32.4 30.6 40.6 26.6Z" />
							</g>
						</svg>
					{/if}
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
		{#if fundsInRow && (showBalance || showWin)}
			<div class="funds-row">{@render funds()}</div>
		{/if}
	</div>
</div>

<style>
	.tb-wrap {
		--spin-size: clamp(62px, 11vh, 80px);
		--adj: 40px;
		--amount: 24px;
		--funds: 20px;
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
	/* the owner's dock: a brass-rimmed plaque of smoked glass, so the room shows through; equal sides keep SPIN
	   exactly in the middle. Only the controls carry the ink line and drop (D-042): a filter over the whole dock
	   would paint its shadows through the glass and make it opaque again. The drop is shorter than on the solid
	   plaques so it never smudges the readouts on the lighter glass. */
	.dock {
		--cut: 18px;
		--edge-w: 2px;
		--glass: rgba(9, 9, 10, 0.4);
		position: relative;
		isolation: isolate;
		padding: 10px 24px;
	}
	.dock > .row,
	.dock > .funds-row {
		filter: var(--ink-outline) drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
	}
	.glass,
	.rim,
	.rim > span {
		position: absolute;
		pointer-events: none;
	}
	.glass {
		--c: calc(var(--cut) - var(--edge-w) * 0.41);
		inset: var(--edge-w);
		z-index: -2;
		clip-path: polygon(
			var(--c) 0,
			calc(100% - var(--c)) 0,
			100% var(--c),
			100% calc(100% - var(--c)),
			calc(100% - var(--c)) 100%,
			var(--c) 100%,
			0 calc(100% - var(--c)),
			0 var(--c)
		);
		background:
			linear-gradient(180deg, rgba(255, 236, 190, 0.08), rgba(255, 236, 190, 0) 45%),
			var(--glass);
		-webkit-backdrop-filter: blur(7px) saturate(1.15);
		backdrop-filter: blur(7px) saturate(1.15);
	}
	/* the rim: a brass ring with the ink line on both edges */
	.rim {
		inset: 0;
		z-index: -1;
		filter: var(--ink-outline);
	}
	.rim > span {
		--e: var(--edge-w);
		--ci: calc(var(--cut) - var(--edge-w) * 0.41);
		inset: 0;
		background: linear-gradient(160deg, #f3dc9a 0%, #b8902f 38%, #e9c96e 62%, #8a6a2a 100%);
		clip-path: polygon(
			evenodd,
			var(--cut) 0,
			calc(100% - var(--cut)) 0,
			100% var(--cut),
			100% calc(100% - var(--cut)),
			calc(100% - var(--cut)) 100%,
			var(--cut) 100%,
			0 calc(100% - var(--cut)),
			0 var(--cut),
			var(--cut) 0,
			calc(var(--e) + var(--ci)) var(--e),
			var(--e) calc(var(--e) + var(--ci)),
			var(--e) calc(100% - var(--e) - var(--ci)),
			calc(var(--e) + var(--ci)) calc(100% - var(--e)),
			calc(100% - var(--e) - var(--ci)) calc(100% - var(--e)),
			calc(100% - var(--e)) calc(100% - var(--e) - var(--ci)),
			calc(100% - var(--e)) calc(var(--e) + var(--ci)),
			calc(100% - var(--e) - var(--ci)) var(--e),
			calc(var(--e) + var(--ci)) var(--e)
		);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 10px;
	}
	.row.tight {
		display: flex;
		justify-content: space-between;
	}
	.left-group {
		display: flex;
		align-items: center;
		gap: 14px;
		flex: 0 0 auto;
	}
	/* BALANCE and WIN: the same label-over-value readout as BET, split by a thin gold rule */
	.funds {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.readout {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.funds .readout + .readout {
		border-left: 1px solid var(--rule);
		padding-left: 14px;
	}
	.readout .val {
		font-size: var(--funds);
		transition: color 0.3s ease;
	}
	.readout.win.hot .val {
		color: var(--gold-text);
	}
	/* phones: one slim row along the bottom of the dock, BALANCE left and WIN right (the spin knob rises out of
	   the top edge) */
	.funds-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		padding: 7px 8px 0;
		margin-top: 7px;
		border-top: 1px solid var(--rule);
	}
	.funds-row .readout {
		flex-direction: row;
		align-items: baseline;
		gap: 6px;
	}
	.funds-row .lbl {
		margin-bottom: 0;
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
	/* menu rows: one list split by hairlines, not a stack of outlined buttons */
	.item {
		background: transparent;
		border: 0;
		padding: 10px 14px;
		font-weight: 800;
		font-size: 14px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-align: left;
		width: 100%;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.item + .item {
		border-top: 1px solid var(--rule);
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
	/* SPIN: a round brass button with engraved arrows, raised out of the bar like a machine's spin knob */
	.spin {
		width: var(--spin-size);
		height: var(--spin-size);
		margin: calc(var(--spin-size) * -0.34) 0 calc(var(--spin-size) * -0.1);
		padding: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 50%;
		position: relative;
		color: #1a1208;
		background: radial-gradient(circle at 34% 28%, #fdeab2 0%, #e4bb5c 34%, #b48a33 68%, #6e511d 100%);
		/* cartoon knob: ink ring, brass rim, ink ring again, hard drop shadow */
		box-shadow:
			0 0 0 3px var(--ink-line),
			0 0 0 6px var(--edge),
			0 0 0 9px var(--ink-line),
			0 7px 0 4px rgba(0, 0, 0, 0.55),
			inset 0 -6px 0 rgba(0, 0, 0, 0.22),
			inset 0 3px 6px rgba(255, 255, 255, 0.4);
		transition:
			filter 0.2s ease,
			transform 0.22s var(--bounce);
	}
	/* the shine: a soft white bean in the upper left */
	.spin::before {
		content: '';
		position: absolute;
		left: 18%;
		top: 11%;
		width: 34%;
		height: 20%;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.55);
		transform: rotate(-28deg);
		pointer-events: none;
	}
	.spin-icon {
		width: 56%;
		height: 56%;
		filter: drop-shadow(0 1px 0 rgba(255, 240, 200, 0.5));
	}
	.spin:active:not(:disabled) {
		transform: scale(0.9);
		transition-duration: 0.08s;
	}
	.spin.busy {
		filter: saturate(0.75) brightness(0.82);
	}
	.spin.busy .spin-icon {
		animation: turn 0.9s linear infinite;
	}
	.spin-auto {
		font-family: var(--font-display);
		font-weight: 900;
		font-size: calc(var(--spin-size) * 0.19);
		line-height: 1.05;
		letter-spacing: 0.06em;
		text-align: center;
		padding: 0 8px;
	}
	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}
	.bet {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 0 0 auto;
	}
	.adjust {
		transition:
			transform 0.2s var(--bounce),
			background 0.2s ease,
			color 0.2s ease;
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
		box-shadow: 0 3px 0 rgba(0, 0, 0, 0.5);
	}
	.adjust:active:not(:disabled) {
		transform: scale(0.88);
		transition-duration: 0.08s;
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
		.item:hover {
			background: var(--hover);
		}
		.adjust:hover:not(:disabled) {
			background: var(--accent);
			color: var(--paper);
		}
		.menu-btn:hover {
			border-color: var(--edge);
		}
		.spin:hover:not(:disabled):not(.busy) {
			filter: brightness(1.08);
			transform: scale(1.06) rotate(-6deg);
		}
		.adjust:hover:not(:disabled) {
			transform: scale(1.1);
		}
	}

	/* menu popup (opens above the menu button) */
	.popup {
		position: absolute;
		left: 16px;
		bottom: calc(100% + 6px);
		min-width: 200px;
		--cut: 12px;
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

	/* phones: the owner's small-screen sizes */
	.stacked {
		--spin-size: 62px;
		--adj: 32px;
		--amount: 17px;
		--funds: 15px;
		padding: 0 10px calc(8px + env(safe-area-inset-bottom));
	}
	.stacked .dock {
		padding: 8px 8px 10px;
	}
	.stacked .row {
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
			--spin-size: 56px;
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
		--spin-size: 44px;
		--adj: 28px;
		--amount: 14px;
		--funds: 13px;
		padding: 0 6px 5px;
	}
	.compact .dock {
		--cut: 12px;
		padding: 4px 12px;
	}
	.compact .row {
		gap: 6px;
	}
	.compact .left-group,
	.compact .funds {
		gap: 8px;
	}
	.compact .funds .readout + .readout {
		padding-left: 8px;
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
		margin: calc(var(--spin-size) * -0.18) 0 -2px;
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
		padding: 4px;
		min-width: 160px;
	}
	.compact .item {
		padding: 6px 10px;
		font-size: 11px;
	}

	@media (prefers-reduced-motion: reduce) {
		.popup,
		.spin,
		.item,
		.adjust {
			transition: none;
		}
	}
</style>
