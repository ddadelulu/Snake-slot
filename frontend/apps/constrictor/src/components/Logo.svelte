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
	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		pointer-events: none;
		user-select: none;
		/* soft dark pool so the wordmark reads over any background (vault door, blind light) */
		padding: clamp(10px, 3vh, 26px) clamp(18px, 3vw, 40px);
		background: radial-gradient(ellipse at center, rgba(7, 8, 10, 0.82) 0%, rgba(7, 8, 10, 0.6) 45%, rgba(7, 8, 10, 0) 72%);
	}
	.word {
		font-size: clamp(22px, 4.6vh, 44px);
		letter-spacing: 0.12em;
		line-height: 1;
		background: linear-gradient(180deg, #f3dca6 0%, #d9b26f 45%, #8a6632 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.7));
	}
	.sm .word {
		font-size: clamp(18px, 3.2vh, 30px);
	}
	.plaque {
		font-size: clamp(8px, 1.3vh, 11px);
		font-weight: 800;
		letter-spacing: 0.28em;
		color: var(--ivory-dim);
		padding: 3px 10px;
		border-top: 1px solid rgba(156, 122, 69, 0.6);
		border-bottom: 1px solid rgba(156, 122, 69, 0.6);
	}
</style>
