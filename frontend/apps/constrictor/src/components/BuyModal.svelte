<!-- Feature menu: THE HUNT and VENOM HUNT with their cost at the current bet. A pick opens the confirmation. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import mathConfig from '$game/generated/mathConfig.json';
	import { game, modeCost, type ModeId } from '$game/state/game.svelte';
	import { t } from '$game/i18n';
	import { formatMoney } from '$game/money';
	import { imageUrl } from '$game/stage/assets';

	type Props = { onClose: () => void; onPick: (id: ModeId) => void };
	let { onClose, onPick }: Props = $props();
	const fsc = mathConfig.freeSpins;
	const items: { id: ModeId; img: string }[] = [
		{ id: 'hunt', img: 'sym_KEY' },
		{ id: 'venom', img: 'pearl_venom_grand' },
	];
	const cost = (id: ModeId) => Math.round(game.bet * modeCost(id));
	const desc = (id: ModeId) =>
		id === 'venom'
			? t('mode.venom.desc', { cost: modeCost(id), len: fsc.venomLength, mult: fsc.venomMult })
			: t('mode.hunt.desc', { cost: modeCost(id) });
</script>

<Modal title={t('buy.title')} {onClose} wide>
	<div class="grid">
		{#each items as it}
			<div class="card" class:venom={it.id === 'venom'}>
				{#if imageUrl(it.img)}<img src={imageUrl(it.img)} alt="" />{/if}
				<h3 class="display">{t(`mode.${it.id}`)}</h3>
				<p>{desc(it.id)}</p>
				<div class="price">
					<span class="lbl">{t('buy.cost')}</span>
					<span class="num">{formatMoney(cost(it.id), game.currency)}</span>
				</div>
				<button class="btn primary" disabled={game.busy || game.balance < cost(it.id)} onclick={() => onPick(it.id)}>{t('button.buy')}</button>
			</div>
		{/each}
	</div>
</Modal>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 6px;
		padding: 14px;
		border: 1px solid var(--brass);
		background: radial-gradient(ellipse at 50% 0%, rgba(217, 178, 111, 0.12), transparent 70%);
	}
	.card.venom {
		border-color: #2c9e5e;
		background: radial-gradient(ellipse at 50% 0%, rgba(61, 255, 138, 0.12), transparent 70%);
	}
	img {
		width: clamp(48px, 10vh, 84px);
		height: clamp(48px, 10vh, 84px);
	}
	h3 {
		margin: 0;
		font-size: clamp(20px, 3.6vh, 30px);
		color: var(--brass-hi);
		letter-spacing: 0.08em;
	}
	.venom h3 {
		color: var(--venom);
	}
	p {
		margin: 0;
		color: var(--ivory-dim);
		font-size: 12px;
		flex: 1;
	}
	.price {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.price .lbl {
		font-size: 10px;
		letter-spacing: 0.18em;
		color: var(--ivory-dim);
		text-transform: uppercase;
	}
	.price .num {
		font-size: clamp(16px, 2.8vh, 22px);
		font-weight: 800;
	}
	.btn {
		width: 100%;
	}
</style>
