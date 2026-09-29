<!-- Generic confirmation (feature purchase, SERPENT CALL). -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import { t } from '$game/i18n';

	type Props = { title: string; text: string; onConfirm: () => void; onCancel: () => void };
	let { title, text, onConfirm, onCancel }: Props = $props();
</script>

<Modal {title} onClose={onCancel}>
	<p>{text}</p>
	{#snippet footer()}
		<button class="btn" onclick={onCancel}>{t('button.cancel')}</button>
		<button class="btn primary" onclick={onConfirm}>{t('button.confirm')}</button>
	{/snippet}
</Modal>

<style>
	p {
		margin: 0 0 6px;
		font-size: clamp(13px, 2.1vh, 16px);
	}
</style>
