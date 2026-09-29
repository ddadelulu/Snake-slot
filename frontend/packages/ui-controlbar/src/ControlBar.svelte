<!--
	Studio 12 reusable control bar (Svelte 5). Theme-able with CSS variables; presets: "plain", "studio12",
	"noir" (CONSTRICTOR). All text comes in through props (the game owns i18n/social wording).
	Layouts: "landscape" (bar along the bottom) and "portrait" (thumb-reach cluster). Accessible buttons.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Labels = {
		balance: string;
		bet: string;
		win: string;
		spin: string;
		stop: string;
		betDown: string;
		betUp: string;
		auto: string;
		turbo: string;
		info: string;
		sound: string;
		menu: string;
		buy?: string;
	};

	type Props = {
		labels: Labels;
		balanceText: string;
		betText: string;
		winText: string;
		layout?: 'landscape' | 'portrait';
		preset?: 'plain' | 'studio12' | 'noir';
		spinState?: 'idle' | 'busy' | 'auto' | 'disabled';
		autoText?: string | null;
		turboOn?: boolean;
		muted?: boolean;
		showBalance?: boolean;
		showBetControls?: boolean;
		showSpin?: boolean;
		showAuto?: boolean;
		showTurbo?: boolean;
		showBuy?: boolean;
		showWin?: boolean;
		dense?: boolean;
		canBetDown?: boolean;
		canBetUp?: boolean;
		onSpin?: () => void;
		onStop?: () => void;
		onBetDown?: () => void;
		onBetUp?: () => void;
		onBetOpen?: () => void;
		onAuto?: () => void;
		onTurbo?: () => void;
		onInfo?: () => void;
		onSound?: () => void;
		onMenu?: () => void;
		onBuy?: () => void;
		extra?: Snippet;
		center?: Snippet;
	};

	let {
		labels,
		balanceText,
		betText,
		winText,
		layout = 'landscape',
		preset = 'noir',
		spinState = 'idle',
		autoText = null,
		turboOn = false,
		muted = false,
		showBalance = true,
		showBetControls = true,
		showSpin = true,
		showAuto = true,
		showTurbo = true,
		showBuy = true,
		showWin = true,
		dense = false,
		canBetDown = true,
		canBetUp = true,
		onSpin,
		onStop,
		onBetDown,
		onBetUp,
		onBetOpen,
		onAuto,
		onTurbo,
		onInfo,
		onSound,
		onMenu,
		onBuy,
		extra,
		center,
	}: Props = $props();

	const busy = $derived(spinState === 'busy');
	const auto = $derived(spinState === 'auto');
</script>

<div class="cb {preset} {layout}" class:dense role="toolbar" aria-label="Game controls">
	<div class="group left">
		{#if showBalance}
			<div class="readout" aria-live="polite">
				<span class="lbl">{labels.balance}</span>
				<span class="val num">{balanceText}</span>
			</div>
		{/if}
		{#if showBetControls}
			<div class="bet">
				<button class="ico" aria-label={labels.betDown} disabled={!canBetDown || busy || auto} onclick={() => onBetDown?.()}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
				</button>
				<button class="readout betval" onclick={() => onBetOpen?.()} disabled={busy || auto} aria-label={labels.bet}>
					<span class="lbl">{labels.bet}</span>
					<span class="val num">{betText}</span>
				</button>
				<button class="ico" aria-label={labels.betUp} disabled={!canBetUp || busy || auto} onclick={() => onBetUp?.()}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12" /></svg>
				</button>
			</div>
		{/if}
	</div>

	<div class="group mid">
		{#if center}{@render center()}{/if}
		{#if showSpin}
			<button
				class="spin"
				class:busy
				class:auto
				disabled={spinState === 'disabled'}
				aria-label={auto ? labels.stop : labels.spin}
				onclick={() => (auto ? onStop?.() : onSpin?.())}
			>
				{#if auto}
					<span class="spin-txt">{autoText ?? labels.stop}</span>
				{:else}
					<svg viewBox="0 0 48 48" aria-hidden="true" class="spin-ico">
						<path d="M36 14a15 15 0 1 0 3.5 13" />
						<path d="M36 6v8h-8" />
					</svg>
				{/if}
			</button>
		{/if}
	</div>

	<div class="group right">
		{#if showWin}
			<div class="readout win" aria-live="polite">
				<span class="lbl">{labels.win}</span>
				<span class="val num">{winText}</span>
			</div>
		{/if}
		<div class="icons">
			{#if extra}{@render extra()}{/if}
			{#if showBuy && labels.buy}
				<button class="pill" disabled={busy || auto} onclick={() => onBuy?.()}>{labels.buy}</button>
			{/if}
			{#if showTurbo}
				<button class="ico" class:on={turboOn} aria-pressed={turboOn} aria-label={labels.turbo} onclick={() => onTurbo?.()}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg>
				</button>
			{/if}
			{#if showAuto}
				<button class="ico" class:on={auto} aria-label={labels.auto} disabled={busy && !auto} onclick={() => (auto ? onStop?.() : onAuto?.())}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>
				</button>
			{/if}
			<button class="ico" aria-label={labels.sound} aria-pressed={!muted} onclick={() => onSound?.()}>
				{#if muted}
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="m16 9 5 6M21 9l-5 6" /></svg>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></svg>
				{/if}
			</button>
			<button class="ico" aria-label={labels.info} onclick={() => onInfo?.()}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
			</button>
			<button class="ico" aria-label={labels.menu} onclick={() => onMenu?.()}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
			</button>
		</div>
	</div>
</div>

<style>
	.cb {
		--cb-bg: rgba(12, 13, 15, 0.86);
		--cb-edge: #3a3f46;
		--cb-accent: #d9b26f;
		--cb-accent-dim: #9c7a45;
		--cb-text: #ede6d6;
		--cb-text-dim: #a39c8c;
		--cb-font: system-ui, sans-serif;
		--cb-h: clamp(52px, 9vh, 74px);
		--cb-icon: clamp(30px, 4.6vh, 40px);
		--cb-spin: clamp(58px, 11vh, 86px);
		font-family: var(--cb-font);
		color: var(--cb-text);
		display: grid;
		align-items: center;
		gap: clamp(6px, 1.2vw, 16px);
		box-sizing: border-box;
		pointer-events: auto;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.cb.dense {
		--cb-h: 44px;
		--cb-icon: 26px;
		--cb-spin: 40px;
		gap: 6px;
	}
	.cb.dense .lbl {
		font-size: 8px;
	}
	.cb.dense .val {
		font-size: 12px;
	}
	.cb.dense .betval {
		min-width: 50px;
	}
	.cb.dense.landscape {
		padding: 0 8px;
	}
	.cb.studio12 {
		--cb-accent: #ff6b1a;
		--cb-accent-dim: #b84a0f;
		--cb-font: 'Archivo', system-ui, sans-serif;
	}
	.cb.noir {
		--cb-font: 'Archivo', system-ui, sans-serif;
	}
	.cb.plain {
		--cb-accent: #e6e6e6;
		--cb-accent-dim: #8a8a8a;
	}
	.landscape {
		grid-template-columns: 1fr auto 1fr;
		grid-template-rows: minmax(0, 1fr);
		height: var(--cb-h);
		padding: 0 clamp(8px, 1.6vw, 22px);
		background: var(--cb-bg);
		border-top: 1px solid var(--cb-accent-dim);
		box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.03) inset;
	}
	/* the round spin button rises above the bar instead of overflowing below the viewport */
	.landscape .mid {
		align-self: end;
		padding-bottom: 5px;
	}
	.dense.landscape {
		grid-template-columns: max-content 1fr max-content;
	}
	.dense.landscape .mid {
		align-self: center;
		padding-bottom: 0;
	}
	.portrait {
		grid-template-columns: 1fr;
		grid-template-areas: 'right' 'mid' 'left';
		padding: 8px 12px calc(10px + env(safe-area-inset-bottom));
		background: linear-gradient(to top, rgba(7, 8, 10, 0.95), rgba(7, 8, 10, 0.7));
		border-top: 1px solid var(--cb-accent-dim);
		gap: 8px;
	}
	.portrait .left {
		grid-area: left;
		justify-content: space-between;
	}
	.portrait .mid {
		grid-area: mid;
	}
	.portrait .right {
		grid-area: right;
		justify-content: space-between;
	}
	.group {
		display: flex;
		align-items: center;
		gap: clamp(6px, 1vw, 14px);
		min-width: 0;
	}
	.left {
		justify-content: flex-start;
	}
	.mid {
		justify-content: center;
		gap: 10px;
	}
	.right {
		justify-content: flex-end;
	}
	.icons {
		display: flex;
		gap: clamp(4px, 0.6vw, 8px);
		align-items: center;
	}
	.readout {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.1;
		min-width: 0;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		padding: 0;
	}
	.readout.win {
		align-items: flex-end;
	}
	.lbl {
		font-size: clamp(9px, 1.4vh, 11px);
		letter-spacing: 0.14em;
		color: var(--cb-text-dim);
		text-transform: uppercase;
	}
	.val {
		font-size: clamp(13px, 2.2vh, 18px);
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 38vw;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.bet {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.betval {
		cursor: pointer;
		align-items: center;
		min-width: 64px;
	}
	button {
		cursor: pointer;
		font-family: var(--cb-font);
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ico {
		width: var(--cb-icon);
		height: var(--cb-icon);
		border-radius: 50%;
		border: 1px solid var(--cb-edge);
		background: rgba(255, 255, 255, 0.02);
		display: grid;
		place-items: center;
		padding: 0;
		color: var(--cb-text);
		transition: border-color 120ms, color 120ms, background 120ms;
	}
	.ico:hover:not(:disabled),
	.ico:focus-visible {
		border-color: var(--cb-accent);
		color: var(--cb-accent);
		outline: none;
	}
	.ico.on {
		border-color: var(--cb-accent);
		color: #0b0b0c;
		background: var(--cb-accent);
	}
	.ico svg {
		width: 56%;
		height: 56%;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.pill {
		height: var(--cb-icon);
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--cb-accent-dim);
		background: transparent;
		color: var(--cb-accent);
		font-weight: 800;
		letter-spacing: 0.12em;
		font-size: clamp(10px, 1.5vh, 12px);
	}
	.pill:hover:not(:disabled) {
		background: rgba(217, 178, 111, 0.1);
	}
	.spin {
		width: var(--cb-spin);
		height: var(--cb-spin);
		border-radius: 50%;
		border: 2px solid var(--cb-accent);
		background: radial-gradient(circle at 35% 30%, #2b2e33, #0d0e10 70%);
		box-shadow:
			0 0 0 4px rgba(0, 0, 0, 0.55),
			0 0 0 5px var(--cb-accent-dim),
			0 6px 18px rgba(0, 0, 0, 0.6);
		color: var(--cb-accent);
		display: grid;
		place-items: center;
		padding: 0;
		transition: transform 90ms;
	}
	.spin:active:not(:disabled) {
		transform: scale(0.96);
	}
	.spin:focus-visible {
		outline: 2px solid var(--cb-text);
		outline-offset: 4px;
	}
	.spin-ico {
		width: 48%;
		height: 48%;
		fill: none;
		stroke: currentColor;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.spin.busy .spin-ico {
		animation: turn 0.9s linear infinite;
		opacity: 0.6;
	}
	.spin-txt {
		font-weight: 800;
		font-size: clamp(11px, 1.8vh, 14px);
		letter-spacing: 0.08em;
	}
	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spin.busy .spin-ico {
			animation: none;
		}
	}
</style>
