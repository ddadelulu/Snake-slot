<!--
	Studio 12 reusable loading screen (Svelte 5): studio splash ("STUDIO 12", "12" in #FF6B1A, Archivo) then
	the game's key art with a progress hairline and a tap-to-continue prompt. No platform branding.
	Presets: "studio12" (default) or "plain" (no studio splash).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		progress: number; // 0..1
		ready: boolean;
		preset?: 'studio12' | 'plain';
		title?: string;
		tapText?: string;
		loadingText?: string;
		keyArt?: string | null;
		splashMs?: number;
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
		splashMs = 1400,
		reducedMotion = false,
		onEnter,
		logo,
	}: Props = $props();

	let stage = $state<'splash' | 'game'>(preset === 'studio12' ? 'splash' : 'game');
	onMount(() => {
		if (stage === 'splash') {
			const id = setTimeout(() => (stage = 'game'), reducedMotion ? 400 : splashMs);
			return () => clearTimeout(id);
		}
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
			<div class="studio">STUDIO <span class="twelve">12</span></div>
		</div>
	{:else}
		<div class="game" style={keyArt ? `background-image:url(${keyArt})` : ''}>
			<div class="shade"></div>
			<div class="center">
				{#if logo}{@render logo()}{:else}<h1 class="title">{title}</h1>{/if}
				<div class="bar" aria-hidden="true"><div class="fill" style="transform:scaleX({Math.max(0.02, progress)})"></div></div>
				{#if ready}
					<button class="tap" onclick={enter}>{tapText}</button>
				{:else}
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
	.splash {
		display: grid;
		place-items: center;
		animation: fade 1.4s ease both;
	}
	.studio {
		font-weight: 800;
		letter-spacing: 0.32em;
		font-size: clamp(18px, 4.2vw, 40px);
	}
	.twelve {
		color: #ff6b1a;
		letter-spacing: 0.08em;
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
		color: #111;
		background: rgba(239, 235, 224, 0.9);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid #111;
		border-radius: 28px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
		padding: 0.18em 0.5em;
	}
	/* glass dock style (beige glass, heavy black outline, round corners) */
	.bar {
		width: min(100%, 360px);
		height: 16px;
		padding: 3px;
		border: 3px solid #111;
		border-radius: 999px;
		background: rgba(239, 235, 224, 0.85);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 999px;
		background: #111;
		transform-origin: left;
		transition: transform 0.25s ease;
	}
	.loading {
		font-size: clamp(11px, 1.8vh, 13px);
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #111;
		background: rgba(239, 235, 224, 0.85);
		border: 2px solid #111;
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
		color: #111;
		background: rgba(239, 235, 224, 0.92);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid #111;
		border-radius: 24px;
		box-shadow:
			inset 0 0 0 2px rgba(239, 235, 224, 0.9),
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
			background: #111;
			color: #efebe0;
		}
	}
	@keyframes fade {
		0% {
			opacity: 0;
		}
		25%,
		75% {
			opacity: 1;
		}
		100% {
			opacity: 0;
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
				inset 0 0 0 2px rgba(239, 235, 224, 0.9),
				0 4px 15px rgba(0, 0, 0, 0.35),
				0 0 0 7px rgba(239, 235, 224, 0.28);
		}
	}
	.reduced * {
		animation: none !important;
	}
</style>
