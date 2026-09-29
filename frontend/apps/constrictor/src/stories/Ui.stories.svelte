<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ControlBar } from 'ui-controlbar';
	import { LoadingScreen } from 'ui-loading';
	import HudStory from './HudStory.svelte';
	import ModalStory from './ModalStory.svelte';

	const labels = { balance: 'BALANCE', bet: 'BET', win: 'WIN', spin: 'SPIN', stop: 'STOP', betDown: 'Decrease bet', betUp: 'Increase bet', auto: 'AUTO', turbo: 'TURBO', info: 'Game info', sound: 'Sound', menu: 'Settings', buy: 'BUY' };
	const bar = { labels, balanceText: '$10,000.00', betText: '$1.00', winText: '$12.40', preset: 'noir' as const };
	const { Story } = defineMeta({ title: 'UI/Studio 12 + CONSTRICTOR', component: ControlBar });
</script>

<Story name="Control bar: landscape idle" args={{ ...bar, layout: 'landscape' }} />
<Story name="Control bar: landscape busy" args={{ ...bar, layout: 'landscape', spinState: 'busy' }} />
<Story name="Control bar: autoplay" args={{ ...bar, layout: 'landscape', spinState: 'auto', autoText: 'AUTO 24' }} />
<Story name="Control bar: portrait" args={{ ...bar, layout: 'portrait' }} />
<Story name="Control bar: dense mini-player" args={{ ...bar, layout: 'landscape', dense: true, showAuto: false, showTurbo: false, showWin: false }} />
<Story name="Control bar: studio12 preset" args={{ ...bar, layout: 'landscape', preset: 'studio12' }} />
<Story name="Control bar: social" args={{ ...bar, labels: { ...labels, bet: 'PLAY', buy: 'GET' }, balanceText: '10,000.00 SC', betText: '1.00 SC', winText: '12.40 SC', layout: 'landscape' }} />

<Story name="Loading: studio splash">
	{#snippet template()}<LoadingScreen progress={0.3} ready={false} title="CONSTRICTOR" onEnter={() => {}} />{/snippet}
</Story>
<Story name="Loading: ready">
	{#snippet template()}<LoadingScreen progress={1} ready={true} preset="plain" title="CONSTRICTOR" tapText="Tap to enter the vault" onEnter={() => {}} />{/snippet}
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
<Story name="Modal: buy">{#snippet template()}<ModalStory which="buy" />{/snippet}</Story>
<Story name="Modal: buy (social)">{#snippet template()}<ModalStory which="buy" social />{/snippet}</Story>
<Story name="Modal: SERPENT CALL confirm">{#snippet template()}<ModalStory which="confirmAnte" />{/snippet}</Story>
<Story name="Modal: autoplay">{#snippet template()}<ModalStory which="autoplay" />{/snippet}</Story>
<Story name="Modal: settings">{#snippet template()}<ModalStory which="settings" />{/snippet}</Story>
<Story name="Modal: bet levels">{#snippet template()}<ModalStory which="bet" />{/snippet}</Story>
<Story name="Modal: error (insufficient)">{#snippet template()}<ModalStory which="error" errorCode="ERR_IPB" />{/snippet}</Story>
<Story name="Modal: error (session, fatal)">{#snippet template()}<ModalStory which="error" errorCode="ERR_IS" />{/snippet}</Story>
<Story name="Replay panel">{#snippet template()}<ModalStory which="replay" />{/snippet}</Story>
