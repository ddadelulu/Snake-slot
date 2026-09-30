<script lang="ts">
	import RulesModal from '$components/RulesModal.svelte';
	import AutoplayModal from '$components/AutoplayModal.svelte';
	import SettingsModal from '$components/SettingsModal.svelte';
	import ErrorModal from '$components/ErrorModal.svelte';
	import ConfirmModal from '$components/ConfirmModal.svelte';
	import BetMenu from '$components/BetMenu.svelte';
	import ReplayPanel from '$components/ReplayPanel.svelte';
	import { game } from '$game/state/game.svelte';
	import { configureI18n, t } from '$game/i18n';
	import { onMount } from 'svelte';
	import { loadManifest } from '$game/stage/assets';

	type Props = { which: 'rules' | 'autoplay' | 'settings' | 'error' | 'confirmAnte' | 'bet' | 'replay'; social?: boolean; errorCode?: string };
	let { which, social = false, errorCode = 'ERR_IPB' }: Props = $props();
	let ready = $state(false);
	const noop = () => {};
	onMount(async () => {
		configureI18n({ social, lang: 'en' });
		game.currency = social ? 'XSC' : 'USD';
		game.bet = 1_000_000;
		game.balance = 250_000_000;
		game.betLevels = [100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000];
		game.replay = { mode: 'hunt', costMultiplier: 100, payoutMultiplier: 187.4, betRaw: 1_000_000 };
		game.phase = which === 'replay' ? 'replayReady' : 'idle';
		await loadManifest().catch(() => null);
		ready = true;
	});
</script>

<div class="bg"></div>
{#if ready}
	{#if which === 'rules'}<RulesModal onClose={noop} />
	{:else if which === 'autoplay'}<AutoplayModal onClose={noop} onStart={noop} />
	{:else if which === 'settings'}<SettingsModal onClose={noop} showAutoplay />
	{:else if which === 'error'}<ErrorModal code={errorCode} fatal={errorCode === 'ERR_IS'} onClose={noop} />
	{:else if which === 'confirmAnte'}<ConfirmModal title={t('ante.confirmTitle')} text={t('ante.confirmText', { amount: social ? '2.50 SC' : '$2.50', cost: 2.5 })} onConfirm={noop} onCancel={noop} />
	{:else if which === 'bet'}<BetMenu onClose={noop} onPick={noop} />
	{:else if which === 'replay'}<ReplayPanel onPlay={noop} />
	{/if}
{/if}

<style>
	.bg {
		position: fixed;
		inset: 0;
		background: radial-gradient(ellipse at center, #1b1d21, #07080a);
	}
</style>
