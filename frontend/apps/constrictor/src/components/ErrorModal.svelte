<!-- RGS / session errors. Fatal errors cannot be dismissed (the player must reload). -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import { t } from '$game/i18n';

	type Props = { code: string; fatal: boolean; onClose: () => void };
	let { code, fatal, onClose }: Props = $props();
	const text = $derived.by(() => {
		const k = `error.${code}`;
		const s = t(k);
		return s === k ? t('error.ERR_GEN') : s;
	});
</script>

<Modal title={t('error.title')} onClose={fatal ? undefined : onClose} locked={fatal}>
	<p>{text}</p>
	{#snippet footer()}
		{#if !fatal}<button class="btn primary" onclick={onClose}>{t('button.continue')}</button>{/if}
	{/snippet}
</Modal>

<style>
	p {
		margin: 0;
		font-size: clamp(13px, 2.1vh, 16px);
	}
</style>
