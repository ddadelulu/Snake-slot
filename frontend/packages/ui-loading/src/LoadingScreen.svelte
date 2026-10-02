<!--
	Studio 12 reusable loading screen (Svelte 5), used unchanged on desktop and phones.
	1. Studio screen: the STUDIO12 wordmark ("12" in #FF6B1A, Archivo) over a thin progress bar that shows the
	   real loading progress. It stays up at least `minMs` (2 s) and until loading is done.
	2. Game screen: the game's key art and title with a tap-to-continue button (the tap also unlocks audio).
	No platform branding. Presets: "studio12" (default) or "plain" (no studio screen; progress on the game screen).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		progress: number; // 0..1, real asset loading progress
		ready: boolean;
		preset?: 'studio12' | 'plain';
		title?: string;
		tapText?: string;
		loadingText?: string;
		keyArt?: string | null;
		minMs?: number;
		reducedMotion?: boolean;
		onEnter: () => void;
		logo?: Snippet;
	};
	let {
		progress,
		ready,
		preset = 'studio12',
		title = '',
		tapText = 'Tap to continue',
		loadingText = 'Loading',
		keyArt = null,
		minMs = 2000,
		reducedMotion = false,
		onEnter,
		logo,
	}: Props = $props();

	let stage = $state<'splash' | 'game'>(preset === 'studio12' ? 'splash' : 'game');
	let shown = $state(0); // displayed progress: eases toward the real value, never jumps backwards

	onMount(() => {
		if (stage !== 'splash') return;
		const t0 = performance.now();
		let raf = 0;
		let doneAt = 0;
		const frame = (now: number) => {
			const minDone = now - t0 >= minMs;
			const target = ready ? 1 : Math.max(0, Math.min(1, progress));
			shown = reducedMotion ? target : Math.max(shown, shown + (target - shown) * 0.12);
			if (target - shown < 0.002) shown = target;
			if (ready && minDone && shown >= 1) {
				// hold the full bar for a moment, then hand over to the game screen
				if (!doneAt) doneAt = now;
				if (now - doneAt >= (reducedMotion ? 0 : 250)) {
					stage = 'game';
					return;
				}
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});

	function enter() {
		if (ready && stage === 'game') onEnter();
	}
	function key(e: KeyboardEvent) {
		if (e.code === 'Space' || e.code === 'Enter') {
			e.preventDefault();
			enter();
		}
	}
</script>

<svelte:window onkeydown={key} />

<div class="ls" class:reduced={reducedMotion} role="presentation" onclick={enter}>
	{#if stage === 'splash'}
		<div class="splash">
			<div class="brand">
				<div class="studio" aria-label="Studio 12">STUDIO<span class="twelve">12</span></div>
				<div class="pbar" role="progressbar" aria-label={loadingText} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(shown * 100)}>
					<div class="pfill" style="transform:scaleX({shown})"></div>
				</div>
			</div>
		</div>
	{:else}
		<div class="game" class:with-art={!!keyArt} style={keyArt ? `background-image:url(${keyArt})` : ''}>
			<div class="shade"></div>
			<div class="center">
				{#if logo}{@render logo()}{:else}<h1 class="title">{title}</h1>{/if}
				{#if ready}
					<button class="tap" onclick={enter}>{tapText}</button>
				{:else}
					<div class="bar" aria-hidden="true"><div class="fill" style="transform:scaleX({Math.max(0.02, progress)})"></div></div>
					<div class="loading" aria-live="polite">{loadingText}… {Math.round(progress * 100)}%</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.ls {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: #07080a;
		color: #ede6d6;
		font-family: 'Archivo', system-ui, sans-serif;
		display: grid;
		cursor: pointer;
	}
	/* studio screen: STUDIO12 over a thin progress bar, sized to the viewport (desktop and phones) */
	.splash {
		display: grid;
		place-items: center;
		background: #17181e;
		animation: fadein 0.4s ease both;
	}
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.42em;
		font-size: clamp(20px, 6.4vw, 78px); /* wordmark about a third of the screen width, capped on large screens */
	}
	.studio {
		font-family: 'Archivo', system-ui, sans-serif;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1;
		color: #f2f2f2;
		white-space: nowrap;
	}
	.twelve {
		color: #ff6b1a;
	}
	.pbar {
		width: 6.6em; /* overhangs the wordmark a little on both sides */
		height: max(2px, 0.075em);
		background: #2c2f39;
		border-radius: 2px;
		overflow: hidden;
	}
	.pfill {
		height: 100%;
		background: #ff6b1a;
		transform-origin: left;
	}
	.game {
		position: relative;
		background: #07080a center / cover no-repeat;
		display: grid;
		place-items: center;
		animation: fadein 0.5s ease both;
	}
	.shade {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, rgba(7, 8, 10, 0.25), rgba(7, 8, 10, 0.85));
	}
	/* with key art the title never covers the hero: it takes the art's empty left third on wide screens and the
	   top of the screen on tall ones */
	.game.with-art {
		place-items: center start;
		padding-left: 6vw;
	}
	.with-art .shade {
		background: linear-gradient(90deg, rgba(7, 8, 10, 0.8), rgba(7, 8, 10, 0.2) 55%, rgba(7, 8, 10, 0.45));
	}
	.with-art .center {
		width: auto;
		max-width: min(40vw, 480px);
		align-items: flex-start;
	}
	.with-art .title {
		font-size: clamp(26px, 4.8vw, 76px);
	}
	@media (max-aspect-ratio: 1/1) {
		.game.with-art {
			place-items: start center;
			padding: 12vh 0 0;
		}
		.with-art .shade {
			background: linear-gradient(180deg, rgba(7, 8, 10, 0.85), rgba(7, 8, 10, 0.2) 45%, rgba(7, 8, 10, 0.5));
		}
		.with-art .center {
			width: min(86vw, 520px);
			max-width: none;
			align-items: center;
		}
		.with-art .title {
			font-size: clamp(34px, 11vw, 86px);
		}
	}
	.center {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		width: min(80vw, 520px);
	}
	/* engraved brass letters, no card */
	.title {
		margin: 0;
		font-family: 'Big Shoulders Display', 'Archivo', sans-serif;
		font-weight: 900;
		font-size: clamp(34px, 9vw, 86px);
		letter-spacing: 0.12em;
		line-height: 1;
		padding-left: 0.12em;
		background: linear-gradient(180deg, #fbe7ab 0%, #e2b85a 45%, #9c7433 55%, #e9c870 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.85)) drop-shadow(0 0 18px rgba(0, 0, 0, 0.7));
	}
	/* glass dock style: black glass, gold outline, round corners (matches the game UI) */
	.bar {
		width: min(100%, 360px);
		height: 16px;
		padding: 3px;
		border: 3px solid #d4af37;
		border-radius: 999px;
		background: rgba(8, 8, 9, 0.85);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 999px;
		background: #e0b64a;
		transform-origin: left;
		transition: transform 0.25s ease;
	}
	.loading {
		font-size: clamp(11px, 1.8vh, 13px);
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #ede6d6;
		background: rgba(8, 8, 9, 0.85);
		border: 2px solid #d4af37;
		border-radius: 999px;
		padding: 6px 16px;
		font-variant-numeric: tabular-nums;
	}
	/* a brass-edged plate with cut corners (same hardware as the game's plaques) */
	.tap {
		--c: 12px;
		position: relative;
		isolation: isolate;
		font-family: inherit;
		font-size: clamp(15px, 2.6vh, 20px);
		font-weight: 800;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #e6c46b;
		background: none;
		border: 0;
		padding: 15px 38px;
		cursor: pointer;
		transition: color 0.2s ease;
		animation: pulse 1.8s ease-in-out infinite;
	}
	.tap::before,
	.tap::after {
		content: '';
		position: absolute;
		z-index: -1;
		clip-path: polygon(var(--k) 0, calc(100% - var(--k)) 0, 100% var(--k), 100% calc(100% - var(--k)), calc(100% - var(--k)) 100%, var(--k) 100%, 0 calc(100% - var(--k)), 0 var(--k));
	}
	.tap::before {
		--k: var(--c);
		inset: 0;
		z-index: -2;
		background: linear-gradient(160deg, #f3dc9a 0%, #b8902f 38%, #e9c96e 62%, #8a6a2a 100%);
	}
	.tap::after {
		--k: calc(var(--c) - 1px);
		inset: 2px;
		background: rgba(9, 9, 10, 0.94);
		transition: background 0.2s ease;
	}
	.tap:focus-visible {
		outline: 2px solid #efebe0;
		outline-offset: 4px;
	}
	@media (max-width: 440px) {
		.tap {
			font-size: 14px;
			letter-spacing: 0.1em;
			padding: 12px 22px;
			white-space: nowrap;
		}
	}
	@media (hover: hover) {
		.tap:hover {
			color: #121317;
		}
		.tap:hover::after {
			background: linear-gradient(160deg, #f0d48a 0%, #c99a3c 45%, #e8c66c 70%, #9c7433 100%);
		}
	}
	@keyframes fadein {
		from {
			opacity: 0;
		}
	}
	/* a slow glow behind the plate (drop-shadow follows the cut corners; no movement, so it is easy to tap) */
	@keyframes pulse {
		0%,
		100% {
			filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
		}
		50% {
			filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 12px rgba(224, 182, 74, 0.55));
		}
	}
	.reduced * {
		animation: none !important;
	}
</style>
