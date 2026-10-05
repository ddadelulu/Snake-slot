<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { LoadingScreen } from 'ui-loading';
	import Taskbar from '$components/Taskbar.svelte';
	import BonusButton from '$components/BonusButton.svelte';
	import HudStory from './HudStory.svelte';
	import ModalStory from './ModalStory.svelte';

	const noop = () => {};
	const labels = {
		bet: 'BET', balance: 'BALANCE', win: 'WIN', spin: 'SPIN', skip: 'SKIP', stop: 'STOP',
		betDown: 'Decrease bet', betUp: 'Increase bet', menu: 'Menu',
		auto: 'AUTO SPIN: OFF', speed: 'SPEED: ×1', sound: 'SOUND: ON', rules: 'GAME RULES', settings: 'SETTINGS',
	};
	const bar = {
		labels, layout: 'wide' as const, betText: '$1.00', balanceText: '$10,000.00', winText: '$12.40', spinState: 'idle' as const,
		onSpin: noop, onStop: noop, onBetDown: noop, onBetUp: noop, onBetOpen: noop, onAuto: noop, onSpeed: noop, onSound: noop, onRules: noop, onSettings: noop,
	};
	const bonus = {
		label: 'BUY BONUS',
		items: [{ id: 'hunt', label: 'THE HUNT', price: '$100.00' }, { id: 'venom', label: 'VENOM HUNT', price: '$700.00' }],
		anteLabel: 'SERPENT CALL', anteSub: '2.5× · OFF', anteOn: false, anteChip: 'SERPENT CALL ON', onPick: noop, onAnte: noop,
	};
	const { Story } = defineMeta({ title: 'UI/Studio 12 + CONSTRICTOR', component: Taskbar });
</script>

<Story name="Taskbar: wide idle" args={bar} />
<Story name="Taskbar: busy" args={{ ...bar, spinState: 'busy' }} />
<Story name="Taskbar: autoplay" args={{ ...bar, spinState: 'auto', autoText: 'AUTO 24', labels: { ...labels, auto: 'AUTO SPIN: ON' } }} />
<Story name="Taskbar: phone (stacked)" args={{ ...bar, layout: 'stacked' }} />
<Story name="Taskbar: mini-player (compact)" args={{ ...bar, layout: 'compact' }} />
<Story name="Taskbar: social" args={{ ...bar, labels: { ...labels, bet: 'PLAY', betDown: 'Decrease play amount', betUp: 'Increase play amount' }, betText: '1.00 SC', balanceText: '10,000.00 SC', winText: '12.40 SC' }} />
<Story name="Taskbar: replay (no balance)" args={{ ...bar, showBalance: false, showBet: false, showSpin: false }} />
<Story name="Buy Bonus: closed">
	{#snippet template()}<div style="padding:220px 24px 24px"><BonusButton {...bonus} /></div>{/snippet}
</Story>
<Story name="Buy Bonus: SERPENT CALL on">
	{#snippet template()}<div style="padding:220px 24px 24px"><BonusButton {...bonus} anteOn anteSub="2.5× · ON" /></div>{/snippet}
</Story>

<Story name="Loading: studio splash">
	{#snippet template()}<LoadingScreen progress={0.3} ready={false} title="CONSTRICTOR" onEnter={() => {}} />{/snippet}
</Story>
<Story name="Loading: ready">
	{#snippet template()}<LoadingScreen
			progress={1}
			ready={true}
			preset="plain"
			title="CONSTRICTOR"
			tagline="Win up to 25,000×"
			features={[
				{ title: 'The hatchling', text: 'An EGG hatches a WILD snake. Every PEARL it eats grows the multiplier.' },
				{ title: 'Ouroboros', text: 'When it bites its own tail, the ring is crushed and the multiplier doubles.' },
				{ title: 'The Hunt', text: '3, 4 or 5 KEYs unlock 10, 12 or 15 free spins.' },
			]}
			tapText="Tap to enter the vault"
			onEnter={() => {}}
		/>{/snippet}
</Story>

<Story name="HUD: idle wordmark">
	{#snippet template()}<HudStory layout="side" feature={null} fsCurrent={0} fsTotal={0} moves={0} length={0} mult={1} featureWinX={0} idle />{/snippet}
</Story>
<Story name="HUD: hatchling">
	{#snippet template()}<HudStory layout="side" feature={null} fsCurrent={0} fsTotal={0} moves={6} length={3} mult={3} featureWinX={0} />{/snippet}
</Story>
<Story name="HUD: THE HUNT (side)">
	{#snippet template()}<HudStory layout="side" feature="hunt" fsCurrent={7} fsTotal={15} moves={9} length={12} mult={18} featureWinX={214.6} />{/snippet}
</Story>
<Story name="HUD: VENOM HUNT (top, portrait)">
	{#snippet template()}<HudStory layout="top" feature="venom" fsCurrent={3} fsTotal={12} moves={4} length={14} mult={52} featureWinX={1880} />{/snippet}
</Story>

<Story name="Modal: rules">{#snippet template()}<ModalStory which="rules" />{/snippet}</Story>
<Story name="Modal: SERPENT CALL confirm">{#snippet template()}<ModalStory which="confirmAnte" />{/snippet}</Story>
<Story name="Modal: autoplay">{#snippet template()}<ModalStory which="autoplay" />{/snippet}</Story>
<Story name="Modal: settings">{#snippet template()}<ModalStory which="settings" />{/snippet}</Story>
<Story name="Modal: bet levels">{#snippet template()}<ModalStory which="bet" />{/snippet}</Story>
<Story name="Modal: error (insufficient)">{#snippet template()}<ModalStory which="error" errorCode="ERR_IPB" />{/snippet}</Story>
<Story name="Modal: error (session, fatal)">{#snippet template()}<ModalStory which="error" errorCode="ERR_IS" />{/snippet}</Story>
<Story name="Replay panel">{#snippet template()}<ModalStory which="replay" />{/snippet}</Story>
