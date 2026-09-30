<!-- Text wordmark (no baked text in images) with the max-win plaque. Shown while the HUD is idle. -->
<script lang="ts">
	import mathConfig from '$game/generated/mathConfig.json';
	import { tx } from '$game/i18n';

	type Props = { size?: 'sm' | 'md' };
	let { size = 'md' }: Props = $props();
	const maxWin = mathConfig.maxWin.toLocaleString('en-US');
</script>

<div class="logo {size}" aria-hidden="true">
	<div class="word display">CONSTRICTOR</div>
	<div class="plaque">{tx(`WIN UP TO ${maxWin}×`)}</div>
</div>

<style>
	/* glass card (taskbar style): ink wordmark, inverse pill for the max-win line */
	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		pointer-events: none;
		user-select: none;
		padding: clamp(10px, 2.2vh, 18px) clamp(18px, 2.6vw, 30px);
		background: var(--glass);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--edge);
		border-radius: 24px;
		box-shadow: var(--glass-shadow);
	}
	.word {
		font-size: clamp(22px, 4.6vh, 44px);
		letter-spacing: 0.12em;
		line-height: 1;
		color: var(--accent);
	}
	.sm .word {
		font-size: clamp(18px, 3.2vh, 30px);
	}
	.sm.logo {
		padding: 8px 18px;
		gap: 5px;
	}
	.plaque {
		font-size: clamp(8px, 1.3vh, 11px);
		font-weight: 800;
		letter-spacing: 0.24em;
		color: var(--paper);
		background: var(--accent);
		border-radius: 999px;
		padding: 4px 12px;
	}
</style>
