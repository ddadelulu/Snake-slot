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
		color: #d9b26f;
	}
	.bar {
		width: 100%;
		height: 2px;
		background: rgba(217, 178, 111, 0.18);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: #d9b26f;
		transform-origin: left;
		transition: transform 0.25s ease;
	}
	.loading,
	.tap {
		font-size: clamp(11px, 1.8vh, 14px);
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: #a39c8c;
	}
	.tap {
		background: none;
		border: 1px solid rgba(217, 178, 111, 0.6);
		color: #ede6d6;
		padding: 10px 22px;
		cursor: pointer;
		font-family: inherit;
		animation: pulse 1.8s ease-in-out infinite;
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
			border-color: rgba(217, 178, 111, 1);
		}
	}
	.reduced * {
		animation: none !important;
	}
</style>
