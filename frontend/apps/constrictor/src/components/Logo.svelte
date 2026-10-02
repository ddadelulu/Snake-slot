<!-- Text wordmark (no baked text in images) with the max-win line. Shown while the HUD is idle. Engraved brass
     letters on the room itself, framed by deco rules: no card behind it. -->
<script lang="ts">
	import mathConfig from '$game/generated/mathConfig.json';
	import { tx } from '$game/i18n';

	type Props = { size?: 'sm' | 'md' };
	let { size = 'md' }: Props = $props();
	const maxWin = mathConfig.maxWin.toLocaleString('en-US');
</script>

<div class="logo {size}" aria-hidden="true">
	<div class="word display">CONSTRICTOR</div>
	<div class="tag"><span class="rule"></span><span class="txt">{tx(`WIN UP TO ${maxWin}×`)}</span><span class="rule"></span></div>
</div>

<style>
	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(4px, 0.9vh, 8px);
		pointer-events: none;
		user-select: none;
		padding: clamp(10px, 2.4vh, 22px) clamp(16px, 2.4vw, 30px);
		/* a pool of shadow keeps the letters legible on the busy wall, without drawing a box */
		background: radial-gradient(ellipse 60% 55% at center, rgba(4, 4, 5, 0.75), rgba(4, 4, 5, 0) 100%);
	}
	.word {
		font-size: clamp(24px, 5.2vh, 52px);
		letter-spacing: 0.14em;
		line-height: 1;
		padding-left: 0.14em; /* optically centre the tracked letters */
		background: linear-gradient(180deg, #fbe7ab 0%, #e2b85a 45%, #9c7433 55%, #e9c870 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.85)) drop-shadow(0 0 14px rgba(0, 0, 0, 0.6));
	}
	.sm .word {
		font-size: clamp(20px, 3.4vh, 32px);
	}
	.tag {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
	}
	.rule {
		flex: 1;
		height: 1px;
		min-width: 18px;
		background: linear-gradient(90deg, rgba(212, 175, 55, 0), var(--edge));
		position: relative;
	}
	.rule:last-child {
		background: linear-gradient(90deg, var(--edge), rgba(212, 175, 55, 0));
	}
	/* a small diamond where each rule meets the text */
	.rule::after {
		content: '';
		position: absolute;
		top: -2.5px;
		width: 6px;
		height: 6px;
		background: var(--edge);
		transform: rotate(45deg);
	}
	.rule:first-child::after {
		right: -3px;
	}
	.rule:last-child::after {
		left: -3px;
	}
	.txt {
		font-size: clamp(8px, 1.3vh, 11px);
		font-weight: 800;
		letter-spacing: 0.3em;
		color: var(--gold-text);
		white-space: nowrap;
	}
	.sm .txt {
		font-size: 8px;
		letter-spacing: 0.24em;
	}
</style>
