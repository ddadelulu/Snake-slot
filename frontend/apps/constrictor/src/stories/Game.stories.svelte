<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BookPlayerStory from './BookPlayerStory.svelte';

	// Real books from the published math (dev/books). Categories: see dev/books/showcase.json.
	const { Story } = defineMeta({
		title: 'Game/Book player',
		component: BookPlayerStory,
		argTypes: {
			mode: { control: 'select', options: ['base', 'ante', 'hunt', 'venom'] },
			category: { control: 'select', options: ['loss', 'smallWin', 'hatch', 'tier1', 'tier2', 'tier3', 'tier4', 'trigger3', 'trigger4', 'trigger5', 'retrigger', 'ouroboros', 'ouroboros2', 'longSnake', 'maxWin'] },
		},
	});
</script>

<Story name="Base: loss" args={{ mode: 'base', category: 'loss' }} />
<Story name="Base: small win" args={{ mode: 'base', category: 'smallWin' }} />
<Story name="Base: hatch" args={{ mode: 'base', category: 'hatch' }} />
<Story name="Base: STRIKE" args={{ mode: 'base', category: 'tier1' }} />
<Story name="Base: CONSTRICT" args={{ mode: 'base', category: 'tier2' }} />
<Story name="Base: Hunt trigger (3 keys)" args={{ mode: 'base', category: 'trigger3' }} />
<Story name="Base: Hunt trigger (5 keys)" args={{ mode: 'base', category: 'trigger5' }} />
<Story name="Base: max win" args={{ mode: 'base', category: 'maxWin' }} />
<Story name="Ante: DEVOUR" args={{ mode: 'ante', category: 'tier3' }} />
<Story name="Hunt: OUROBOROS" args={{ mode: 'hunt', category: 'ouroboros' }} />
<Story name="Hunt: OUROBOROS twice" args={{ mode: 'hunt', category: 'ouroboros2' }} />
<Story name="Hunt: long snake (16+)" args={{ mode: 'hunt', category: 'longSnake' }} />
<Story name="Hunt: retrigger" args={{ mode: 'hunt', category: 'retrigger' }} />
<Story name="Hunt: APEX PREDATOR" args={{ mode: 'hunt', category: 'tier4' }} />
<Story name="Hunt: max win" args={{ mode: 'hunt', category: 'maxWin' }} />
<Story name="Venom: OUROBOROS" args={{ mode: 'venom', category: 'ouroboros' }} />
<Story name="Venom: OUROBOROS twice" args={{ mode: 'venom', category: 'ouroboros2' }} />
<Story name="Venom: long snake (16+)" args={{ mode: 'venom', category: 'longSnake' }} />
<Story name="Venom: max win (THE VAULT IS EMPTY)" args={{ mode: 'venom', category: 'maxWin' }} />
<Story name="Turbo: Hunt retrigger" args={{ mode: 'hunt', category: 'retrigger', turbo: true }} />
<Story name="Social: Hunt APEX" args={{ mode: 'hunt', category: 'tier4', social: true }} />
