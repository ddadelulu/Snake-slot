<!-- Modal shell: dimmed backdrop, glass panel (taskbar style), Escape / backdrop closes (unless locked). -->
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
<div class="panel on-glass" class:wide role="dialog" aria-modal="true" aria-label={title} bind:this={panel}>
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
		background: var(--glass-strong);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		border: 3px solid var(--edge);
		border-radius: 24px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.35);
		overflow: hidden;
		color: var(--ink);
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
		color: var(--accent);
		letter-spacing: 0.1em;
	}
	.x {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: 2px solid var(--edge);
		background: none;
		color: var(--ink);
		flex: none;
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
	}
	.x:hover,
	.x:focus-visible {
		background: var(--accent);
		color: var(--paper);
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
