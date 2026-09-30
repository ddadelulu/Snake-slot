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
		<div class="game" style={keyArt ? `background-image:url(${keyArt})` : ''}>
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
	.center {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		width: min(80vw, 520px);
	}
	.title {
		margin: 0;
		font-family: 'Big Shoulders Display', 'Archivo', sans-serif;
		font-weight: 900;
		font-size: clamp(34px, 9vw, 86px);
		letter-spacing: 0.08em;
		line-height: 1;
		color: #d9b26f;
		background: rgba(18, 19, 23, 0.9);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid #cfa865;
		border-radius: 28px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
		padding: 0.18em 0.5em;
	}
	/* glass dock style: dark smoked glass, brass outline, round corners (matches the game UI) */
	.bar {
		width: min(100%, 360px);
		height: 16px;
		padding: 3px;
		border: 3px solid #cfa865;
		border-radius: 999px;
		background: rgba(18, 19, 23, 0.85);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 999px;
		background: #d9b26f;
		transform-origin: left;
		transition: transform 0.25s ease;
	}
	.loading {
		font-size: clamp(11px, 1.8vh, 13px);
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #ede6d6;
		background: rgba(18, 19, 23, 0.85);
		border: 2px solid #cfa865;
		border-radius: 999px;
		padding: 6px 16px;
		font-variant-numeric: tabular-nums;
	}
	.tap {
		font-family: inherit;
		font-size: clamp(15px, 2.6vh, 20px);
		font-weight: 800;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #ede6d6;
		background: rgba(18, 19, 23, 0.92);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid #cfa865;
		border-radius: 24px;
		box-shadow:
			inset 0 0 0 2px rgba(0, 0, 0, 0.35),
			0 4px 15px rgba(0, 0, 0, 0.35);
		padding: 14px 36px;
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
		animation: pulse 1.8s ease-in-out infinite;
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
			background: #d9b26f;
			color: #121317;
		}
	}
	@keyframes fadein {
		from {
			opacity: 0;
		}
	}
	@keyframes pulse {
		50% {
			box-shadow:
				inset 0 0 0 2px rgba(0, 0, 0, 0.35),
				0 4px 15px rgba(0, 0, 0, 0.35),
				0 0 0 7px rgba(217, 178, 111, 0.3);
		}
	}
	.reduced * {
		animation: none !important;
	}
</style>
