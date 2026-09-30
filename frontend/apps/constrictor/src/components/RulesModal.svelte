<!-- Game info: rules, paytable (at the current bet), modes (cost, RTP, max win), UI guide, legal. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import mathConfig from '$game/generated/mathConfig.json';
	import { game, type ModeId } from '$game/state/game.svelte';
	import { t, tx } from '$game/i18n';
	import { rulesSections, uiGuide, disclaimer, modeRtp, anteFactor } from '$game/i18n/rules';
	import { formatMoney } from '$game/money';
	import { imageUrl } from '$game/stage/assets';

	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	const tabs = ['rules', 'paytable', 'modes', 'ui', 'legal'] as const;
	let tab = $state<(typeof tabs)[number]>('rules');

	const NAMES: Record<string, string> = {
		H1: 'Black Opal Eye',
		H2: 'Serpent Signet Ring',
		H3: 'Venom Vial',
		H4: 'Pocket Watch',
		L1: 'Ruby',
		L2: 'Sapphire',
		L3: 'Citrine',
		L4: 'Amethyst',
	};
	const bands = mathConfig.paytable.bands.map(([lo, hi]) => (hi >= 49 ? `${lo}+` : lo === hi ? `${lo}` : `${lo}–${hi}`));
	const symbols = Object.entries(mathConfig.paytable.symbols) as [string, number[]][];
	const pay = (x: number) => formatMoney(Math.round(game.bet * x), game.currency);
	const fsc = mathConfig.freeSpins;
	const modeDesc = (id: ModeId, cost: number) => {
		if (id === 'ante') return t('mode.ante.desc', { cost, factor: anteFactor() });
		if (id === 'venom') return t('mode.venom.desc', { cost, len: fsc.venomLength, mult: fsc.venomMult });
		return t(`mode.${id}.desc`, { cost });
	};
	const sections = rulesSections();
	const guide = uiGuide();
</script>

<Modal title={t('rules.title')} {onClose} wide>
	<div class="tabs" role="tablist">
		{#each tabs as id}
			<button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id)}>{t(`rules.tab.${id}`)}</button>
		{/each}
	</div>

	{#if tab === 'rules'}
		{#each sections as s}
			<section>
				<h3>{s.title}</h3>
				{#each s.paragraphs as p}<p>{p}</p>{/each}
			</section>
		{/each}
	{:else if tab === 'paytable'}
		<p class="muted">{tx(`Cluster wins at the current bet (${formatMoney(game.bet, game.currency)}). Cluster size counts real symbols plus WILD snake cells.`)}</p>
		<div class="pt-wrap">
			<table class="pt">
				<thead>
					<tr>
						<th></th>
						{#each bands as b}<th class="num">{b}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each symbols as [code, row]}
						<tr>
							<th class="sym">
								{#if imageUrl(`sym_${code}`)}<img src={imageUrl(`sym_${code}`)} alt={NAMES[code]} />{/if}
								<span class="sr-only">{NAMES[code]}</span>
							</th>
							{#each row as v}<td class="num">{pay(v)}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="specials">
			<div class="sp">
				{#if imageUrl('sym_EGG')}<img src={imageUrl('sym_EGG')} alt="" />{/if}
				<p><b>EGG</b> — {tx('Hatches the snake. Base game only, at most one per board.')}</p>
			</div>
			<div class="sp">
				{#if imageUrl('sym_KEY')}<img src={imageUrl('sym_KEY')} alt="" />{/if}
				<p><b>KEY</b> — {tx(`3, 4 or 5 KEYs award ${fsc.awards['3']}, ${fsc.awards['4']} or ${fsc.awards['5']} free spins. KEYs do not pay.`)}</p>
			</div>
			<div class="sp">
				{#if imageUrl('pearl_white')}<img src={imageUrl('pearl_white')} alt="" />{/if}
				<p><b>PEARL</b> — {tx('Adds its value to the multiplier when the snake eats it: +1, +2, +3, +5, +10, +25.')}</p>
			</div>
		</div>
	{:else if tab === 'modes'}
		{#each mathConfig.modes as m}
			<section class="mode">
				<h3>{t(`mode.${m.id}`)}</h3>
				<p>{modeDesc(m.id as ModeId, m.cost)}</p>
				<dl>
					<dt>{t('buy.cost')}</dt>
					<dd class="num">{m.cost}× · {formatMoney(Math.round(game.bet * m.cost), game.currency)}</dd>
					<dt>RTP</dt>
					<dd class="num">{(modeRtp(m.id) * 100).toFixed(2)}%</dd>
					<dt>{tx('Max win')}</dt>
					<dd class="num">{m.maxWin.toLocaleString('en-US')}×</dd>
				</dl>
			</section>
		{/each}
	{:else if tab === 'ui'}
		<dl class="guide">
			{#each guide as g}
				<dt>{g.label}</dt>
				<dd>{g.text}</dd>
			{/each}
		</dl>
	{:else}
		<p>{disclaimer()}</p>
		<p class="muted">{tx(`Math version ${mathConfig.mathVersion}.`)}</p>
	{/if}
</Modal>

<style>
	.tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.tabs button {
		background: none;
		border: 2px solid var(--edge);
		border-radius: 999px;
		color: var(--ink);
		font-family: var(--font-ui);
		font-weight: 800;
		letter-spacing: 0.12em;
		font-size: 11px;
		padding: 6px 12px;
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
	}
	.tabs button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.tabs button.on {
		background: var(--accent);
		color: var(--paper);
	}
	h3 {
		margin: 14px 0 4px;
		font-size: 12px;
		letter-spacing: 0.18em;
		color: var(--brass-hi);
	}
	p {
		margin: 0 0 8px;
	}
	.muted {
		color: var(--ivory-dim);
	}
	.pt-wrap {
		overflow-x: auto;
	}
	.pt {
		border-collapse: collapse;
		width: 100%;
		font-size: 12px;
	}
	.pt th,
	.pt td {
		padding: 4px 6px;
		text-align: right;
		border-bottom: 1px solid var(--rule);
		white-space: nowrap;
	}
	.pt thead th {
		color: var(--ivory-dim);
		font-weight: 600;
	}
	.pt .sym {
		text-align: left;
	}
	.pt img {
		width: 34px;
		height: 34px;
		display: block;
	}
	.specials {
		margin-top: 12px;
		display: grid;
		gap: 8px;
	}
	.sp {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.sp img {
		width: 40px;
		height: 40px;
		flex: none;
	}
	.sp p {
		margin: 0;
	}
	.mode dl,
	.guide {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 14px;
		margin: 6px 0 0;
	}
	dt {
		color: var(--ivory-dim);
		font-weight: 800;
		letter-spacing: 0.1em;
		font-size: 11px;
	}
	dd {
		margin: 0;
	}
</style>
