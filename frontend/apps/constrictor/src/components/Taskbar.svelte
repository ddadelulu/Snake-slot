<!--
	The game's taskbar: a floating glass dock (menu | SPIN | bet), after the owner's layout (slot_layout.html),
	set in the game's own fonts. The menu button opens a small popup (auto spin, speed, sound, rules, settings).
	BALANCE and WIN stay on the dock at all times (Stake requirement). Layouts:
	  wide     one row: menu + balance | SPIN | win + bet
	  stacked  phones: a readout row (balance, win) above the button row
	  compact  mini-player: one slim row, no win (the side HUD shows it)
-->
<script lang="ts">
	type Labels = {
		balance: string;
		win: string;
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
		balanceText: string;
		betText: string;
		winText: string;
		spinState: 'idle' | 'busy' | 'auto' | 'disabled';
		autoText?: string | null;
		showBalance?: boolean;
		showBet?: boolean;
		showSpin?: boolean;
		showWin?: boolean;
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
		balanceText,
		betText,
		winText,
		spinState,
		autoText = null,
		showBalance = true,
		showBet = true,
		showSpin = true,
		showWin = true,
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

	<div class="dock" role="toolbar" aria-label="Game controls">
		{#if layout === 'stacked' && (showBalance || showWin)}
			<div class="info">
				{#if showBalance}
					<div class="readout" aria-live="polite"><span class="lbl">{labels.balance}</span><span class="val num">{balanceText}</span></div>
				{/if}
				{#if showWin}
					<div class="readout win" aria-live="polite"><span class="lbl">{labels.win}</span><span class="val num">{winText}</span></div>
				{/if}
			</div>
		{/if}
		<div class="row">
			<div class="side left">
				<button class="menu-btn" class:open={menuOpen} aria-label={labels.menu} aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
					<span></span><span></span><span></span>
				</button>
				{#if layout !== 'stacked' && showBalance}
					<div class="readout" aria-live="polite"><span class="lbl">{labels.balance}</span><span class="val num">{balanceText}</span></div>
				{/if}
			</div>

			<div class="center">
				{#if showSpin}
					<button
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
				{#if layout !== 'stacked' && showWin}
					<div class="readout win" aria-live="polite"><span class="lbl">{labels.win}</span><span class="val num">{winText}</span></div>
				{/if}
				{#if showBet}
					<div class="bet">
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
</div>

<style>
	.tb-wrap {
		/* owner's palette: beige glass, black ink, ivory */
		--glass: rgba(239, 235, 224, 0.85);
		--glass-menu: rgba(239, 235, 224, 0.92);
		--ink: #111;
		--paper: #efebe0;
		--dock-radius: 30px;
		--spin-font: clamp(20px, 3.8vh, 28px);
		--spin-pad: clamp(8px, 1.5vh, 14px) clamp(28px, 4vw, 45px);
		--adj: 40px;
		--amount: 24px;
		position: relative;
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
		padding: 0 16px 12px;
		box-sizing: border-box;
		font-family: var(--font-ui);
		color: var(--ink);
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.dock {
		background: var(--glass);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--ink);
		border-radius: var(--dock-radius);
		padding: 10px 20px;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	/* equal flexible sides keep SPIN exactly centred */
	.side {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.side.right {
		justify-content: flex-end;
	}
	.center {
		flex: 0 0 auto;
		display: flex;
		justify-content: center;
	}
	.info {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 0 6px 6px;
		border-bottom: 1px solid rgba(17, 17, 17, 0.25);
	}
	.info .readout {
		flex-direction: row;
		align-items: baseline;
		gap: 6px;
	}

	/* readouts */
	.readout {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.1;
		min-width: 0;
	}
	.readout.win {
		align-items: flex-end;
	}
	.lbl {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.val {
		font-size: clamp(14px, 2.3vh, 18px);
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}

	/* buttons (owner's styles) */
	button {
		font-family: var(--font-ui);
		color: var(--ink);
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
		border: 2px solid var(--ink);
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
		background: var(--ink);
		border-radius: 4px;
	}
	.menu-btn.open {
		border-color: var(--ink);
	}
	.spin {
		font-family: var(--font-display);
		font-size: var(--spin-font);
		font-weight: 900;
		letter-spacing: 0.08em;
		line-height: 1;
		padding: var(--spin-pad);
		background: var(--ink);
		color: var(--paper);
		border: 3px solid var(--ink);
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
		color: var(--ink);
		box-shadow: none;
	}
	.spin.auto {
		font-size: calc(var(--spin-font) * 0.72);
		background: var(--paper);
		color: var(--ink);
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
		border: 2px solid var(--ink);
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
	}
	.betval .lbl {
		letter-spacing: 2px;
		margin-bottom: 2px;
	}
	.betval .val {
		font-size: var(--amount);
	}
	@media (hover: hover) {
		.btn:hover,
		.adjust:hover:not(:disabled) {
			background: var(--ink);
			color: var(--paper);
		}
		.menu-btn:hover {
			border-color: var(--ink);
		}
		.spin:hover:not(:disabled):not(.busy) {
			background: transparent;
			color: var(--ink);
			box-shadow: none;
		}
	}

	/* settings popup (opens above the menu button) */
	.popup {
		position: absolute;
		left: 16px;
		bottom: calc(100% + 6px);
		min-width: 190px;
		background: var(--glass-menu);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--ink);
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

	/* phones: readout row above the buttons */
	.stacked {
		--spin-font: 22px;
		--spin-pad: 10px 26px;
		--adj: 36px;
		--amount: 20px;
		--dock-radius: 26px;
		padding: 0 10px calc(8px + env(safe-area-inset-bottom));
	}
	.stacked .dock {
		padding: 8px 12px 10px;
	}
	.stacked .row {
		gap: 8px;
	}
	.stacked .side {
		flex: none;
	}
	.stacked .bet {
		gap: 6px;
	}
	.stacked .betval {
		min-width: 72px;
	}
	.stacked .val {
		font-size: 15px;
	}
	.stacked .betval .val {
		font-size: var(--amount);
	}
	.stacked .popup {
		left: 10px;
	}
	@media (max-width: 359px) {
		.stacked {
			--spin-pad: 9px 18px;
			--adj: 32px;
			--amount: 17px;
		}
		.stacked .menu-btn {
			width: 38px;
		}
		.stacked .betval {
			min-width: 60px;
		}
	}

	/* mini-player: one slim row */
	.compact {
		--spin-font: 16px;
		--spin-pad: 6px 16px;
		--adj: 28px;
		--amount: 13px;
		--dock-radius: 20px;
		padding: 0 6px 5px;
	}
	.compact .dock {
		padding: 4px 10px;
		border-width: 2px;
	}
	.compact .row,
	.compact .side {
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
	}
	.compact .val {
		font-size: 12px;
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
