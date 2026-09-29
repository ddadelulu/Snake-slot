<!--
	CONSTRICTOR game shell. Pixi stage fills the viewport; DOM UI (HUD, feature buttons, control bar,
	overlays, modals) sits on top. The board slot is computed here and handed to the stage, so the canvas
	and the DOM always agree on where the board is. Layouts: landscape, compact landscape (mini-player),
	portrait.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ControlBar } from 'ui-controlbar';
	import { LoadingScreen } from 'ui-loading';
	import Hud from './Hud.svelte';
	import WinOverlay from './WinOverlay.svelte';
	import RulesModal from './RulesModal.svelte';
	import BuyModal from './BuyModal.svelte';
	import ConfirmModal from './ConfirmModal.svelte';
	import ErrorModal from './ErrorModal.svelte';
	import AutoplayModal from './AutoplayModal.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import BetMenu from './BetMenu.svelte';
	import ReplayPanel from './ReplayPanel.svelte';
	import Modal from './Modal.svelte';
	import Logo from './Logo.svelte';
	import StatusPlaque from './StatusPlaque.svelte';
	import { game, modeCost, type ModeId } from '$game/state/game.svelte';
	import { parseLaunchParams, type LaunchParams } from '$game/url';
	import { configureI18n, t } from '$game/i18n';
	import { anteFactor } from '$game/i18n/rules';
	import { formatMoney, bookToMoney } from '$game/money';
	import { Stage } from '$game/stage/Stage';
	import { loadManifest, loadTextures, audioUrl, imageUrl } from '$game/stage/assets';
	import { sound } from '$game/sound';
	import { clock } from '$game/stage/clock';
	import { createBookPlayer } from '$game/bookHandlers';
	import type { AuthResponse } from '$game/rgs';
	import {
		setupRound,
		authenticate,
		resumeRound,
		playRound,
		requestSkip,
		stepBet,
		setBet,
		startAutoplay,
		stopAutoplay,
		loadReplay,
		playReplay,
		type AutoplaySettings,
	} from '$game/round';

	let host: HTMLDivElement;
	let stage = $state<Stage | null>(null);
	let params = $state<LaunchParams | null>(null);
	let auth: AuthResponse | null = null;
	let progress = $state(0);
	let ready = $state(false);
	let entered = $state(false);
	let keyArt = $state<string | null>(null);
	let vw = $state(1280);
	let vh = $state(720);
	let barH = $state(0);

	// ------------------------------------------------------------------------------------------ layout
	const L = $derived.by(() => {
		const W = vw, H = vh;
		const portrait = H > W * 1.1;
		const compact = !portrait && (H < 330 || W < 560);
		if (portrait) {
			const hudH = Math.max(58, Math.min(96, H * 0.1));
			const featH = W < 360 ? 44 : 52;
			const avail = H - barH - hudH - featH - 12;
			const size = Math.max(120, Math.min(W - 10, avail));
			const y = hudH + Math.max(0, (avail - size) / 2);
			return { portrait, compact, hudH, featH, board: { x: (W - size) / 2, y, size }, side: 0 };
		}
		const pad = compact ? 4 : Math.round(H * 0.02);
		const avail = H - barH - pad * 2;
		const sideMin = compact ? 92 : Math.min(230, W * 0.18);
		const size = Math.max(100, Math.min(avail, W - 2 * sideMin));
		return { portrait, compact, hudH: 0, featH: 0, board: { x: (W - size) / 2, y: pad + (avail - size) / 2, size }, side: (W - size) / 2 };
	});
	$effect(() => {
		stage?.setSlot(L.board);
	});

	// ------------------------------------------------------------------------------------------ settings
	const SETTINGS_KEY = 'constrictor.settings';
	function loadSettings() {
		game.reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		try {
			const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
			if (s && typeof s === 'object') {
				if (typeof s.soundOn === 'boolean') game.soundOn = s.soundOn;
				if (typeof s.musicVolume === 'number') game.musicVolume = s.musicVolume;
				if (typeof s.sfxVolume === 'number') game.sfxVolume = s.sfxVolume;
				if (typeof s.turbo === 'boolean') game.turbo = s.turbo;
				if (typeof s.reducedMotion === 'boolean') game.reducedMotion = s.reducedMotion;
			}
		} catch {
			/* storage unavailable */
		}
	}
	$effect(() => {
		const s = { soundOn: game.soundOn, musicVolume: game.musicVolume, sfxVolume: game.sfxVolume, turbo: game.turbo, reducedMotion: game.reducedMotion };
		sound.setMuted(!s.soundOn);
		sound.setVolumes(s.musicVolume, s.sfxVolume);
		clock.speed = s.turbo && !game.jurisdiction.disabledTurbo ? 2.2 : 1;
		clock.reducedMotion = s.reducedMotion;
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
		} catch {
			/* fine */
		}
	});

	// ------------------------------------------------------------------------------------------ boot
	onMount(() => {
		const p = parseLaunchParams();
		params = p;
		configureI18n({ social: p.social, lang: p.lang });
		loadSettings();
		if (p.currency) game.currency = p.currency;
		void boot(p);
		return () => stage?.app.destroy(true);
	});

	async function boot(p: LaunchParams) {
		game.phase = 'loading';
		const st = new Stage();
		setupRound(p, createBookPlayer(st));
		const serverP: Promise<unknown> = p.replay ? loadReplay() : authenticate();
		try {
			const m = await loadManifest();
			keyArt = imageUrl('keyart');
			for (const id of Object.keys(m.audio)) {
				const u = audioUrl(id);
				if (u) sound.register(id, u);
			}
		} catch {
			/* no manifest: drawn fallbacks */
		}
		progress = 0.1;
		await loadTextures((x) => (progress = 0.1 + 0.7 * x));
		try {
			await Promise.all([
				document.fonts.load('900 64px "Big Shoulders Display"'),
				document.fonts.load('700 32px "Archivo"'),
			]);
		} catch {
			/* system fallback */
		}
		await st.init(host);
		st.showIdleBoard();
		stage = st;
		progress = 0.9;
		const res = await serverP;
		if (!p.replay) auth = res as AuthResponse | null;
		progress = 1;
		ready = true;
	}

	async function enter() {
		entered = true;
		const unlocked = sound.unlock();
		await unlocked;
		sound.loop('music_base', { music: true, volume: 0.7, fade: 2 });
		sound.loop('amb_vault', { volume: 0.35, fade: 2 });
		if (params?.replay) return;
		if (game.phase === 'loading') game.phase = 'idle';
		const r = auth?.round;
		if (r && r.active === true && game.modal !== 'error') await resumeRound(r);
	}

	// ------------------------------------------------------------------------------------------ actions
	const money = (raw: number) => formatMoney(raw, game.currency);
	const canPlay = $derived(entered && !params?.replay && game.phase === 'idle' && !game.modal && !game.autoplay);

	function spin() {
		if (game.busy) {
			requestSkip();
			return;
		}
		if (!canPlay) return;
		void playRound(game.activeMode);
	}

	function toggleAnte() {
		if (game.busy || game.autoplay) return;
		if (game.anteOn) game.anteOn = false;
		else game.modal = 'confirmAnte';
	}

	function openBuy() {
		if (!canPlay || game.jurisdiction.disabledBuyFeature) return;
		game.modal = 'buy';
	}

	function pickBuy(id: ModeId) {
		game.pendingBuy = id;
		game.modal = 'confirmBuy';
	}

	function confirmBuy() {
		const id = game.pendingBuy;
		game.modal = null;
		game.pendingBuy = null;
		if (id) void playRound(id);
	}

	function beginAutoplay(s: AutoplaySettings) {
		game.modal = null;
		void startAutoplay(s);
	}

	function closeModal() {
		if (game.modal === 'error' && game.error?.fatal) return;
		if (game.modal === 'error') game.error = null;
		game.modal = null;
	}

	function onKey(e: KeyboardEvent) {
		if (e.code !== 'Space') return;
		const el = e.target as HTMLElement | null;
		if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
		if (!entered || game.modal) return;
		e.preventDefault();
		if (e.repeat || game.jurisdiction.disabledSpacebar) return;
		if (params?.replay) {
			if (game.phase === 'playing') requestSkip();
			else if (game.phase === 'replayReady' || game.phase === 'replayDone') void playReplay();
			return;
		}
		if (game.busy) requestSkip();
		else if (game.autoplay) stopAutoplay();
		else spin();
	}
	function onKeyUp(e: KeyboardEvent) {
		// stop a focused button from also "clicking" on keyup
		if (e.code === 'Space' && entered && !game.modal) {
			const el = e.target as HTMLElement | null;
			if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) e.preventDefault();
		}
	}

	const spinState = $derived<'idle' | 'busy' | 'auto' | 'disabled'>(
		game.autoplay ? 'auto' : game.busy ? 'busy' : canPlay ? 'idle' : 'disabled',
	);
	const betIdx = $derived(game.betLevels.indexOf(game.bet));
	const labels = $derived({
		balance: t('hud.balance'),
		bet: t('hud.bet'),
		win: t('hud.win'),
		spin: t('button.spin'),
		stop: t('button.stop'),
		betDown: t('button.betDown'),
		betUp: t('button.betUp'),
		auto: t('button.autoplay'),
		turbo: t('button.turbo'),
		info: t('button.info'),
		sound: t('button.sound'),
		menu: t('button.settings'),
		buy: t('button.buy'),
	});
	const winText = $derived(money(bookToMoney(game.totalWin, game.roundBet || game.bet)));
	const autoText = $derived(game.autoplay ? t('autoplay.remaining', { n: game.autoplay.remaining }) : null);
	const replayMode = $derived(!!params?.replay);
	const showFeatures = $derived(!replayMode && !game.jurisdiction.disabledBuyFeature);
	const anteCost = modeCost('ante');
	const snakeOn = $derived(game.snakeLen > 0 && (game.moves !== null || game.fs !== null));
	const hudIdle = $derived(!game.fs && !snakeOn);
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onkeydown={onKey} onkeyup={onKeyUp} />

<div class="host" bind:this={host}></div>

<div class="ui" class:portrait={L.portrait} class:compact={L.compact}>
	<!-- board slot: taps skip the animation -->
	<div
		class="slot"
		style="left:{L.board.x}px;top:{L.board.y}px;width:{L.board.size}px;height:{L.board.size}px"
		role="presentation"
		onclick={() => game.busy && requestSkip()}
	></div>

	{#if entered}
		{#if L.portrait}
			<div class="top" style="height:{L.hudH}px">
				{#if hudIdle}<Logo size="sm" />{:else}<Hud layout="top" />{/if}
			</div>
			{#if showFeatures}
				<div class="featrow" style="bottom:{barH}px;height:{L.featH}px">
					<button class="feat buy" onclick={openBuy} disabled={!canPlay}>
						<span class="f-main display">{t('button.buy')}</span>
						<span class="f-sub">{t('mode.hunt')}</span>
					</button>
					<button class="feat ante" class:on={game.anteOn} aria-pressed={game.anteOn} onclick={toggleAnte} disabled={game.busy || !!game.autoplay}>
						<span class="f-main display">{t('button.ante')}</span>
						<span class="f-sub num">{anteCost}× · {game.anteOn ? 'ON' : 'OFF'}</span>
					</button>
				</div>
			{/if}
		{:else}
			<div class="side left" style="width:{L.side}px;bottom:{barH}px">
				{#if showFeatures}
					<button class="feat buy" onclick={openBuy} disabled={!canPlay}>
						{#if !L.compact && imageUrl('sym_KEY')}<img src={imageUrl('sym_KEY')} alt="" />{/if}
						<span class="f-main display">{t('button.buy')}</span>
						<span class="f-sub">{t('mode.hunt')} · {t('mode.venom')}</span>
					</button>
					<button class="feat ante" class:on={game.anteOn} aria-pressed={game.anteOn} onclick={toggleAnte} disabled={game.busy || !!game.autoplay}>
						<span class="f-main display">{t('button.ante')}</span>
						<span class="f-sub num">{anteCost}× · HUNT ×{anteFactor()}</span>
						<span class="switch" aria-hidden="true"><span></span></span>
					</button>
				{/if}
			</div>
			<div class="side right" style="width:{L.side}px;bottom:{barH}px">
				{#if game.fs || L.compact}<Hud layout="side" showWin={L.compact} showStats={L.compact} />{:else}<Logo />{/if}
			</div>
			{#if snakeOn && !L.compact}
				<!-- MOVES + snake status on the board's top rail (above the board) -->
				<div class="plaque-slot" style="left:{L.board.x + L.board.size / 2}px;top:{L.board.y + L.board.size * 0.035}px">
					<StatusPlaque />
				</div>
			{/if}
		{/if}
	{/if}

	<div class="bar" bind:clientHeight={barH}>
		{#if entered}
			<ControlBar
				{labels}
				balanceText={replayMode ? '' : money(game.balance)}
				betText={money(game.bet)}
				{winText}
				layout={L.portrait ? 'portrait' : 'landscape'}
				preset="noir"
				dense={L.compact}
				{spinState}
				{autoText}
				turboOn={game.turbo}
				muted={!game.soundOn}
				showBalance={!replayMode}
				showBetControls={!replayMode}
				showSpin={!replayMode}
				showAuto={!replayMode && !L.compact && !game.jurisdiction.disabledAutoplay}
				showTurbo={!L.compact && !game.jurisdiction.disabledTurbo}
				showBuy={false}
				showWin={!L.compact}
				canBetDown={betIdx > 0}
				canBetUp={betIdx < game.betLevels.length - 1}
				onSpin={spin}
				onStop={stopAutoplay}
				onBetDown={() => stepBet(-1)}
				onBetUp={() => stepBet(1)}
				onBetOpen={() => !game.busy && !game.autoplay && (game.modal = 'bet')}
				onAuto={() => canPlay && (game.modal = 'autoplay')}
				onTurbo={() => (game.turbo = !game.turbo)}
				onInfo={() => (game.modal = 'rules')}
				onSound={() => (game.soundOn = !game.soundOn)}
				onMenu={() => (game.modal = 'settings')}
			/>
		{/if}
	</div>
</div>

{#if entered}
	<WinOverlay />
{/if}

{#if entered && replayMode}
	<ReplayPanel onPlay={() => void playReplay()} />
{/if}

{#if !entered}
	<LoadingScreen
		{progress}
		{ready}
		title={t('game.title')}
		tapText={t('loading.tap')}
		loadingText={t('loading.loading')}
		{keyArt}
		reducedMotion={game.reducedMotion}
		onEnter={enter}
	/>
{/if}

{#if entered}
	{#if game.modal === 'rules'}
		<RulesModal onClose={closeModal} />
	{:else if game.modal === 'buy'}
		<BuyModal onClose={closeModal} onPick={pickBuy} />
	{:else if game.modal === 'confirmBuy' && game.pendingBuy}
		<ConfirmModal
			title={t('buy.confirmTitle')}
			text={t('buy.confirmText', { mode: t(`mode.${game.pendingBuy}`), amount: money(Math.round(game.bet * modeCost(game.pendingBuy))) })}
			onConfirm={confirmBuy}
			onCancel={() => ((game.modal = 'buy'), (game.pendingBuy = null))}
		/>
	{:else if game.modal === 'confirmAnte'}
		<ConfirmModal
			title={t('ante.confirmTitle')}
			text={t('ante.confirmText', { amount: money(Math.round(game.bet * anteCost)), cost: anteCost })}
			onConfirm={() => ((game.anteOn = true), (game.modal = null))}
			onCancel={closeModal}
		/>
	{:else if game.modal === 'autoplay'}
		<AutoplayModal onClose={closeModal} onStart={beginAutoplay} />
	{:else if game.modal === 'settings'}
		<SettingsModal onClose={closeModal} showAutoplay={L.compact && !replayMode} onAutoplay={() => canPlay || game.phase === 'idle' ? (game.modal = 'autoplay') : null} />
	{:else if game.modal === 'bet'}
		<BetMenu onClose={closeModal} onPick={(v) => (setBet(v), (game.modal = null))} />
	{:else if game.modal === 'resume'}
		<Modal title={t('resume.title')} locked><p>{t('resume.text')}</p></Modal>
	{/if}
{/if}
{#if game.modal === 'error' && game.error && (entered || game.error.fatal)}
	<div class="err-layer">
		<ErrorModal code={game.error.code} fatal={game.error.fatal} onClose={closeModal} />
	</div>
{/if}

<style>
	.host {
		position: fixed;
		inset: 0;
		z-index: 0;
	}
	.ui {
		position: fixed;
		inset: 0;
		z-index: 10;
		pointer-events: none;
	}
	.slot {
		position: absolute;
		pointer-events: auto;
		-webkit-tap-highlight-color: transparent;
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: auto;
	}
	.top {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: calc(env(safe-area-inset-top) + 6px) 8px 4px;
	}
	.side {
		position: absolute;
		top: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: clamp(8px, 2vh, 18px);
		padding: 12px clamp(8px, 1.4vw, 22px);
	}
	.side.left {
		left: 0;
	}
	.side.right {
		right: 0;
	}
	.featrow {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		gap: 8px;
		padding: 4px 10px;
		justify-content: center;
		pointer-events: auto;
	}
	.feat {
		pointer-events: auto;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		width: min(100%, 200px);
		padding: clamp(6px, 1.4vh, 14px) 10px;
		background: linear-gradient(180deg, rgba(23, 25, 28, 0.92), rgba(10, 11, 13, 0.92));
		border: 1px solid var(--brass);
		color: var(--ivory);
		cursor: pointer;
		box-shadow:
			0 0 0 3px rgba(0, 0, 0, 0.5),
			0 0 0 4px rgba(156, 122, 69, 0.3);
		transition: border-color 120ms, transform 90ms;
	}
	.feat:hover:not(:disabled),
	.feat:focus-visible {
		border-color: var(--brass-hi);
		outline: none;
	}
	.feat:active:not(:disabled) {
		transform: scale(0.98);
	}
	.feat:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.feat img {
		width: clamp(36px, 8vh, 72px);
		height: clamp(36px, 8vh, 72px);
	}
	.f-main {
		font-size: clamp(15px, 3vh, 26px);
		color: var(--brass-hi);
		letter-spacing: 0.1em;
		line-height: 1;
	}
	.f-sub {
		font-size: clamp(8px, 1.3vh, 11px);
		letter-spacing: 0.14em;
		color: var(--ivory-dim);
		text-align: center;
	}
	.feat.ante.on {
		border-color: var(--venom);
		box-shadow:
			0 0 0 3px rgba(0, 0, 0, 0.5),
			0 0 0 4px rgba(61, 255, 138, 0.35),
			0 0 18px rgba(61, 255, 138, 0.18);
	}
	.feat.ante.on .f-main {
		color: var(--venom);
	}
	.switch {
		margin-top: 4px;
		width: 30px;
		height: 14px;
		border-radius: 7px;
		border: 1px solid var(--gunmetal);
		position: relative;
	}
	.switch span {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ivory-dim);
		transition: transform 150ms;
	}
	.feat.on .switch {
		border-color: var(--venom);
	}
	.feat.on .switch span {
		transform: translateX(16px);
		background: var(--venom);
	}
	.portrait .feat {
		flex: 1;
		padding: 4px 8px;
		flex-direction: column;
	}
	.compact .feat {
		padding: 5px 6px;
	}
	.compact .f-main {
		font-size: 13px;
	}
	.compact .f-sub {
		display: none;
	}
	.compact .side {
		padding: 4px;
		gap: 6px;
	}
	.plaque-slot {
		position: absolute;
		transform: translate(-50%, -50%);
		z-index: 2;
	}
	.err-layer {
		position: relative;
		z-index: 200;
	}
	.err-layer :global(.backdrop) {
		z-index: 200;
	}
	.err-layer :global(.panel) {
		z-index: 201;
	}
	p {
		margin: 0;
	}
</style>
