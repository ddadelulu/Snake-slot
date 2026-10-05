<!--
	Studio 12 reusable loading screen (Svelte 5), used unchanged on desktop and phones.
	1. Studio screen: the STUDIO12 wordmark ("12" in #FF6B1A, Archivo) over a thin progress bar that shows the
	   real loading progress. It stays up at least `minMs` (2 s) and until loading is done.
	2. Game screen: an Art Deco poster over the game's key art: a fan crest, the title and a tagline on top, feature
	   cards, and a brass tap-to-continue plate (the tap also unlocks audio) or a brass gauge while loading.
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
		tagline?: string;
		features?: { title: string; text: string; icon?: string | null }[];
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
		tagline = '',
		features = [],
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
			<div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
			<header class="head">
				<!-- Art Deco fan crest -->
				<svg class="crest" viewBox="0 0 160 52" aria-hidden="true">
					<defs>
						<linearGradient id="ls-brass" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stop-color="#fbe7ab" /><stop offset="0.5" stop-color="#d9b26f" /><stop offset="1" stop-color="#9c7433" />
						</linearGradient>
					</defs>
					<g fill="url(#ls-brass)" stroke="#140d05" stroke-width="1.6" stroke-linejoin="round">
						{#each Array.from({ length: 9 }, (_, i) => i) as i (i)}
							{@const a0 = Math.PI * (1 + i / 9)}
							{@const a1 = Math.PI * (1 + (i + 0.62) / 9)}
							<path d="M80 50 L{80 + Math.cos(a0) * 48} {50 + Math.sin(a0) * 48} L{80 + Math.cos(a1) * 48} {50 + Math.sin(a1) * 48} Z" />
						{/each}
						<path d="M62 50 A18 18 0 0 1 98 50 Z" />
						<path d="M8 49 H58 M102 49 H152" fill="none" stroke="url(#ls-brass)" stroke-width="2.4" />
					</g>
				</svg>
				{#if logo}{@render logo()}{:else}<h1 class="title">{title}</h1>{/if}
				{#if tagline}<div class="tagline"><span class="rule"></span><span class="txt">{tagline}</span><span class="rule"></span></div>{/if}
			</header>
			{#if features.length}
				<ul class="features">
					{#each features as f, i (i)}
						<li class="feature" style="--d:{0.15 + i * 0.12}s">
							{#if f.icon}<img src={f.icon} alt="" />{/if}
							<div class="ftxt"><strong>{f.title}</strong><span>{f.text}</span></div>
						</li>
					{/each}
				</ul>
			{/if}
			<footer class="cta">
				{#if ready}
					<button class="tap" onclick={enter}>{tapText}</button>
				{:else}
					<div class="gauge" aria-hidden="true"><div class="gfill" style="transform:scaleX({Math.max(0.02, progress)})"></div></div>
					<div class="loading" aria-live="polite">{loadingText}… {Math.round(progress * 100)}%</div>
				{/if}
			</footer>
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
		font-family: 'Josefin Sans', 'Archivo', system-ui, sans-serif;
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
	/* game screen: a centred Art Deco poster over the key art (title on top, the hero in the middle band, the call
	   to action at the bottom, feature cards on the left of wide screens and in a row on tall ones) */
	.game {
		position: relative;
		background: #07080a center / cover no-repeat;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr);
		grid-template-rows: auto 1fr auto;
		grid-template-areas: 'head head head' 'feat . .' 'cta cta cta';
		padding: clamp(14px, 4vh, 40px) clamp(18px, 4vw, 64px) clamp(18px, 5vh, 52px);
		gap: 12px;
		overflow: hidden;
		animation: fadein 0.5s ease both;
	}
	.shade {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(180deg, rgba(7, 8, 10, 0.82) 0%, rgba(7, 8, 10, 0) 30%, rgba(7, 8, 10, 0) 62%, rgba(7, 8, 10, 0.88) 100%),
			linear-gradient(90deg, rgba(7, 8, 10, 0.6) 0%, rgba(7, 8, 10, 0) 36%),
			radial-gradient(ellipse at center, rgba(7, 8, 10, 0), rgba(7, 8, 10, 0.4));
	}
	.game:not(.with-art) .shade {
		background: radial-gradient(ellipse at center, rgba(30, 40, 58, 0.5), rgba(7, 8, 10, 1));
	}
	/* a double brass hairline round the screen with stepped corner brackets */
	.frame {
		position: absolute;
		inset: clamp(8px, 1.6vmin, 16px);
		border: 1px solid rgba(212, 175, 55, 0.5);
		outline: 1px solid rgba(212, 175, 55, 0.2);
		outline-offset: 5px;
		pointer-events: none;
	}
	.frame i {
		position: absolute;
		width: clamp(18px, 4vmin, 34px);
		height: clamp(18px, 4vmin, 34px);
		border: 0 solid #d9b26f;
	}
	.frame i:nth-child(1) {
		top: 6px;
		left: 6px;
		border-width: 2px 0 0 2px;
	}
	.frame i:nth-child(2) {
		top: 6px;
		right: 6px;
		border-width: 2px 2px 0 0;
	}
	.frame i:nth-child(3) {
		bottom: 6px;
		left: 6px;
		border-width: 0 0 2px 2px;
	}
	.frame i:nth-child(4) {
		bottom: 6px;
		right: 6px;
		border-width: 0 2px 2px 0;
	}
	.head {
		grid-area: head;
		position: relative;
		justify-self: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(2px, 0.8vh, 8px);
		animation: drop 0.7s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.crest {
		width: clamp(70px, 13vmin, 150px);
		height: auto;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.6));
	}
	/* engraved brass letters with the game's ink line */
	.title {
		margin: 0;
		font-family: 'Limelight', 'Josefin Sans', sans-serif;
		font-weight: 400;
		font-size: clamp(30px, min(10vh, 8vw), 104px);
		letter-spacing: 0.05em;
		line-height: 1.05;
		padding-left: 0.05em;
		background: linear-gradient(180deg, #fbe7ab 0%, #e2b85a 45%, #9c7433 55%, #e9c870 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(3px 0 0 #140d05) drop-shadow(-3px 0 0 #140d05) drop-shadow(0 3px 0 #140d05)
			drop-shadow(0 -3px 0 #140d05) drop-shadow(0 7px 0 rgba(0, 0, 0, 0.7));
	}
	.tagline {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-width: min(78vw, 420px);
	}
	.tagline .txt {
		font-size: clamp(10px, 1.9vh, 21px);
		font-weight: 700;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: #e6c46b;
		white-space: nowrap;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.8));
	}
	.rule {
		position: relative;
		flex: 1;
		height: 1px;
		min-width: 24px;
		background: linear-gradient(90deg, rgba(212, 175, 55, 0), #d4af37);
	}
	.rule:last-child {
		background: linear-gradient(90deg, #d4af37, rgba(212, 175, 55, 0));
	}
	.rule::after {
		content: '';
		position: absolute;
		top: -3px;
		width: 7px;
		height: 7px;
		background: #d4af37;
		transform: rotate(45deg);
	}
	.rule:first-child::after {
		right: -4px;
	}
	.rule:last-child::after {
		left: -4px;
	}
	/* feature cards: small lacquer plaques with a brass edge and cut corners */
	.features {
		grid-area: feat;
		position: relative;
		align-self: center;
		justify-self: start;
		width: min(100%, clamp(260px, 24vw, 420px));
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: clamp(8px, 1.6vh, 14px);
	}
	.feature {
		--c: 10px;
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: clamp(8px, 1.4vh, 12px) 14px;
		filter: drop-shadow(2px 0 0 #140d05) drop-shadow(-2px 0 0 #140d05) drop-shadow(0 2px 0 #140d05) drop-shadow(0 -2px 0 #140d05)
			drop-shadow(0 4px 0 rgba(0, 0, 0, 0.5));
		animation: slidein 0.6s cubic-bezier(0.2, 1.2, 0.4, 1) var(--d) both;
	}
	.feature::before,
	.feature::after {
		content: '';
		position: absolute;
		pointer-events: none;
		clip-path: polygon(var(--k) 0, calc(100% - var(--k)) 0, 100% var(--k), 100% calc(100% - var(--k)), calc(100% - var(--k)) 100%, var(--k) 100%, 0 calc(100% - var(--k)), 0 var(--k));
	}
	.feature::before {
		--k: var(--c);
		inset: 0;
		z-index: -2;
		background: linear-gradient(160deg, #f3dc9a 0%, #b8902f 38%, #e9c96e 62%, #8a6a2a 100%);
	}
	.feature::after {
		--k: calc(var(--c) - 1px);
		inset: 2px;
		z-index: -1;
		background: linear-gradient(180deg, rgba(255, 236, 190, 0.07), rgba(255, 236, 190, 0) 50%), rgba(9, 9, 10, 0.86);
	}
	.feature img {
		width: clamp(34px, 6vh, 64px);
		height: clamp(34px, 6vh, 64px);
		object-fit: contain;
		flex: none;
	}
	.ftxt {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.ftxt strong {
		font-family: 'Limelight', 'Josefin Sans', sans-serif;
		font-weight: 400;
		font-size: clamp(13px, 2.1vh, 22px);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #e6c46b;
	}
	.ftxt span {
		font-size: clamp(11px, 1.7vh, 17px);
		line-height: 1.3;
		color: #ede6d6;
	}
	.cta {
		grid-area: cta;
		position: relative;
		justify-self: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		width: min(86vw, 520px);
	}
	/* a brass gauge with a moving sheen */
	.gauge {
		--c: 6px;
		position: relative;
		width: 100%;
		height: 16px;
		padding: 3px;
		background: linear-gradient(160deg, #f3dc9a 0%, #b8902f 38%, #e9c96e 62%, #8a6a2a 100%);
		clip-path: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% 50%, calc(100% - var(--c)) 100%, var(--c) 100%, 0 50%);
	}
	.gauge::before {
		content: '';
		position: absolute;
		inset: 3px;
		background: #0b0b0c;
		clip-path: inherit;
	}
	.gfill {
		position: relative;
		height: 100%;
		background: linear-gradient(90deg, #9c7433, #f3dc9a 50%, #c99a3c), #e0b64a;
		transform-origin: left;
		transition: transform 0.25s ease;
	}
	.loading {
		font-size: clamp(11px, 1.8vh, 13px);
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: #ede6d6;
		font-variant-numeric: tabular-nums;
	}
	/* the call to action: a solid brass plate with engraved letters (the game's primary button) */
	.tap {
		--c: 14px;
		position: relative;
		isolation: isolate;
		font-family: inherit;
		font-size: clamp(15px, 2.7vh, 21px);
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #1a1208;
		background: none;
		border: 0;
		padding: clamp(13px, 2.2vh, 20px) clamp(26px, 5vw, 52px);
		white-space: nowrap;
		cursor: pointer;
		animation: pulse 1.8s ease-in-out infinite;
		transition: transform 0.22s cubic-bezier(0.34, 1.7, 0.6, 1);
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
		background: linear-gradient(160deg, #fff1c4 0%, #c99a3c 40%, #f0d48a 65%, #8a6a2a 100%);
	}
	.tap::after {
		--k: calc(var(--c) - 1px);
		inset: 3px;
		background: linear-gradient(180deg, #f3dc9a 0%, #d9ad4f 48%, #c39236 52%, #e8c66c 100%);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
	}
	.tap:focus-visible {
		outline: 2px solid #efebe0;
		outline-offset: 4px;
	}
	@media (hover: hover) {
		.tap:hover {
			transform: translateY(-2px) scale(1.04);
		}
	}
	.tap:active {
		transform: translateY(1px) scale(0.95);
	}
	/* tall screens: one column; the cards become a compact row under the hero */
	@media (max-aspect-ratio: 1/1) {
		.game {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto 1fr auto auto;
			grid-template-areas: 'head' '.' 'feat' 'cta';
			padding-left: clamp(12px, 4vw, 40px);
			padding-right: clamp(12px, 4vw, 40px);
		}
		.title {
			font-size: clamp(30px, min(7vh, 11vw), 96px);
		}
		.features {
			justify-self: stretch;
			width: 100%;
			flex-direction: row;
			gap: 8px;
		}
		.feature {
			flex: 1;
			flex-direction: column;
			text-align: center;
			gap: 6px;
			padding: 10px 6px;
			min-width: 0;
		}
		.ftxt strong {
			font-size: clamp(10px, 3vw, 15px);
			letter-spacing: 0.03em;
		}
		.ftxt span {
			font-size: clamp(9px, 2.7vw, 13px);
		}
	}
	/* short screens (pop-out players): no cards, a smaller head */
	@media (max-height: 430px) {
		.features {
			display: none;
		}
		.crest {
			width: clamp(48px, 10vmin, 90px);
		}
		.title {
			font-size: clamp(22px, 11vh, 60px);
		}
		.tagline {
			min-width: min(60vw, 300px);
		}
		.tagline .txt {
			font-size: 9px;
			letter-spacing: 0.24em;
		}
		.tap {
			font-size: 11px;
			letter-spacing: 0.14em;
			padding: 8px 16px;
		}
	}
	@media (max-width: 440px) and (min-height: 431px) {
		.tap {
			font-size: 14px;
			letter-spacing: 0.12em;
			padding: 12px 22px;
			white-space: nowrap;
		}
	}
	@keyframes drop {
		from {
			opacity: 0;
			transform: translateY(-14px);
		}
	}
	@keyframes slidein {
		from {
			opacity: 0;
			transform: translateX(-18px);
		}
	}
	@keyframes fadein {
		from {
			opacity: 0;
		}
	}
	/* a slow glow round the plate (drop-shadow follows the cut corners; no movement, so it is easy to tap) */
	@keyframes pulse {
		0%,
		100% {
			filter: drop-shadow(2px 0 0 #140d05) drop-shadow(-2px 0 0 #140d05) drop-shadow(0 2px 0 #140d05)
				drop-shadow(0 -2px 0 #140d05) drop-shadow(0 5px 0 rgba(0, 0, 0, 0.55));
		}
		50% {
			filter: drop-shadow(2px 0 0 #140d05) drop-shadow(-2px 0 0 #140d05) drop-shadow(0 2px 0 #140d05)
				drop-shadow(0 -2px 0 #140d05) drop-shadow(0 5px 0 rgba(0, 0, 0, 0.55)) drop-shadow(0 0 16px rgba(240, 200, 100, 0.75));
		}
	}
	.reduced * {
		animation: none !important;
	}
</style>
