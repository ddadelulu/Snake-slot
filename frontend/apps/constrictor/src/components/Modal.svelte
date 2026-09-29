<!-- Modal shell: dimmed backdrop, brass-edged panel, Escape / backdrop closes (unless locked). -->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { t } from '$game/i18n';

	type Props = {
		title: string;
		onClose?: () => void;
		wide?: boolean;
		locked?: boolean; // no close button, Escape and backdrop do nothing
		children: Snippet;
		footer?: Snippet;
	};
	let { title, onClose, wide = false, locked = false, children, footer }: Props = $props();
	let panel: HTMLElement;

	onMount(() => {
		const first = panel.querySelector<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
		first?.focus({ preventScroll: true });
	});

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape' && !locked) {
			e.preventDefault();
			onClose?.();
		}
		if (e.code === 'Space') e.stopPropagation();
	}
</script>

<svelte:window onkeydown={key} />

<div class="backdrop" role="presentation" onclick={() => !locked && onClose?.()}></div>
<div class="panel" class:wide role="dialog" aria-modal="true" aria-label={title} bind:this={panel}>
	<header>
		<h2 class="display">{title}</h2>
		{#if !locked && onClose}
			<button class="x" aria-label={t('button.close')} onclick={() => onClose?.()}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button>
		{/if}
	</header>
	<div class="body">{@render children()}</div>
	{#if footer}<footer>{@render footer()}</footer>{/if}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(4, 5, 6, 0.72);
		z-index: 40;
		animation: fade 160ms ease both;
	}
	.panel {
		position: fixed;
		z-index: 41;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(92vw, 460px);
		max-height: min(90dvh, 720px);
		display: flex;
		flex-direction: column;
		background: linear-gradient(180deg, #17191c, #0e0f11);
		border: 1px solid var(--brass);
		box-shadow:
			0 0 0 3px rgba(0, 0, 0, 0.6),
			0 0 0 4px rgba(156, 122, 69, 0.35),
			0 24px 60px rgba(0, 0, 0, 0.7);
		color: var(--ivory);
		animation: rise 200ms ease both;
	}
	.panel.wide {
		width: min(94vw, 760px);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: clamp(10px, 2.4vh, 18px) clamp(14px, 3vw, 22px) 0;
	}
	h2 {
		margin: 0;
		font-size: clamp(18px, 3.6vh, 28px);
		color: var(--brass-hi);
		letter-spacing: 0.1em;
	}
	.x {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: 1px solid var(--gunmetal);
		background: none;
		color: var(--ivory);
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
	}
	.x:hover,
	.x:focus-visible {
		border-color: var(--brass-hi);
		color: var(--brass-hi);
		outline: none;
	}
	.x svg {
		width: 16px;
		height: 16px;
		stroke: currentColor;
		stroke-width: 2;
		fill: none;
		stroke-linecap: round;
	}
	.body {
		padding: clamp(10px, 2vh, 16px) clamp(14px, 3vw, 22px);
		overflow-y: auto;
		overscroll-behavior: contain;
		font-size: clamp(12px, 1.9vh, 14px);
		line-height: 1.5;
	}
	footer {
		padding: 0 clamp(14px, 3vw, 22px) clamp(12px, 2.4vh, 18px);
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, -46%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.panel {
			animation: none;
		}
	}
</style>
