<!-- Settings: sound, volumes, turbo, reduced motion. In compact layouts it also holds AUTO and TURBO. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import { game } from '$game/state/game.svelte';
	import { t } from '$game/i18n';

	type Props = { onClose: () => void; onAutoplay?: () => void; showAutoplay?: boolean };
	let { onClose, onAutoplay, showAutoplay = false }: Props = $props();
</script>

<Modal title={t('settings.title')} {onClose}>
	<label class="row">
		<span>{t('settings.sound')}</span>
		<input type="checkbox" bind:checked={game.soundOn} />
	</label>
	<label class="row">
		<span>{t('settings.music')}</span>
		<input type="range" min="0" max="1" step="0.05" bind:value={game.musicVolume} disabled={!game.soundOn} />
	</label>
	<label class="row">
		<span>{t('settings.sfx')}</span>
		<input type="range" min="0" max="1" step="0.05" bind:value={game.sfxVolume} disabled={!game.soundOn} />
	</label>
	{#if !game.jurisdiction.disabledTurbo}
		<label class="row">
			<span>{t('settings.turbo')}</span>
			<input type="checkbox" bind:checked={game.turbo} />
		</label>
	{/if}
	<label class="row">
		<span>{t('settings.reducedMotion')}</span>
		<input type="checkbox" bind:checked={game.reducedMotion} />
	</label>
	<p class="hint">{t('settings.spaceToSpin')}</p>
	{#if showAutoplay && !game.jurisdiction.disabledAutoplay}
		<button class="btn" onclick={() => onAutoplay?.()} disabled={game.busy}>{t('autoplay.title')}</button>
	{/if}
</Modal>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 0;
		border-top: 1px solid rgba(17, 17, 17, 0.2);
	}
	input[type='checkbox'] {
		accent-color: #111;
		width: 18px;
		height: 18px;
	}
	input[type='range'] {
		accent-color: #111;
		width: min(50%, 200px);
	}
	.hint {
		color: var(--ivory-dim);
		font-size: 12px;
		margin: 10px 0;
	}
	.btn {
		width: 100%;
	}
</style>
