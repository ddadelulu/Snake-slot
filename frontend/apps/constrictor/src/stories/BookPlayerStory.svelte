<!-- Plays a real showcase book (math/extract_books.py) through the real stage and book handlers. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Stage } from '$game/stage/Stage';
	import { loadManifest, loadTextures } from '$game/stage/assets';
	import { createBookPlayer } from '$game/bookHandlers';
	import { game } from '$game/state/game.svelte';
	import { configureI18n } from '$game/i18n';
	import { clock } from '$game/stage/clock';
	import type { Book } from '$game/model/bookTypes';
	import Hud from '$components/Hud.svelte';
	import WinOverlay from '$components/WinOverlay.svelte';

	type Props = { mode: string; category: string; index?: number; turbo?: boolean; social?: boolean };
	let { mode, category, index = 0, turbo = false, social = false }: Props = $props();
	let host: HTMLDivElement;
	let status = $state('loading…');
	let stage: Stage | null = null;
	let player: ReturnType<typeof createBookPlayer> | null = null;
	let book = $state<Book | null>(null);

	async function loadBook(): Promise<Book | null> {
		const idx = await (await fetch('./dev/books/showcase.json')).json();
		const ids: number[] = idx[mode]?.showcase?.[category] ?? [];
		if (!ids.length) return null;
		const id = ids[index % ids.length];
		const text = await (await fetch(`./dev/books/${mode}.jsonl`)).text();
		const line = text.split('\n').find((l) => l.startsWith(`{"id":${id},`));
		return line ? (JSON.parse(line) as Book) : null;
	}

	function fit() {
		if (!stage || !host) return;
		const w = host.clientWidth, h = host.clientHeight;
		const size = Math.min(w * 0.68, h * 0.94);
		stage.setSlot({ x: (w - size) / 2, y: (h - size) / 2, size });
	}

	async function play() {
		if (!player || !book) return;
		game.phase = 'playing';
		game.roundMode = mode as typeof game.roundMode;
		game.roundBet = 1_000_000;
		game.totalWin = 0;
		clock.skipping = false;
		status = `book ${book.id} · ${mode}/${category} · payout ${(book.payoutMultiplier / 100).toLocaleString('en-US')}×`;
		await player.play(book.events);
		game.phase = 'idle';
	}

	onMount(() => {
		configureI18n({ social, lang: 'en' });
		game.currency = social ? 'XSC' : 'USD';
		game.turbo = turbo;
		clock.speed = turbo ? 2 : 1;
		const ro = new ResizeObserver(fit);
		(async () => {
			await loadManifest();
			await loadTextures();
			stage = new Stage();
			await stage.init(host);
			stage.showIdleBoard();
			player = createBookPlayer(stage);
			ro.observe(host);
			fit();
			book = await loadBook();
			if (!book) status = `no showcase book for ${mode}/${category}`;
			else await play();
		})();
		return () => {
			ro.disconnect();
			stage?.app.destroy(true);
		};
	});
</script>

<div class="host" bind:this={host}></div>
<div class="side"><Hud layout="side" showWin /></div>
<WinOverlay />
<div class="bar">
	<span>{status}</span>
	<button onclick={play} disabled={game.busy || !book}>replay</button>
	<button onclick={() => ((clock.skipping = true), clock.flush())}>skip</button>
</div>

<style>
	.host {
		position: fixed;
		inset: 0;
	}
	.side {
		position: fixed;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		width: 15%;
		min-width: 110px;
	}
	.bar {
		position: fixed;
		left: 8px;
		bottom: 8px;
		display: flex;
		gap: 8px;
		align-items: center;
		font: 12px var(--font-ui);
		color: var(--ivory-dim);
		z-index: 50;
	}
	button {
		background: #15171a;
		color: #ede6d6;
		border: 1px solid #9c7a45;
		padding: 4px 10px;
		cursor: pointer;
	}
</style>
