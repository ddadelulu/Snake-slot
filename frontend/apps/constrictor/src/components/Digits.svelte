<!-- A counting amount with every digit in a cell of the same width. The UI and display faces have proportional
     figures only (no tabular numerals), so a counting number would otherwise jiggle as its digits change.
     Screen readers get the plain text. -->
<script lang="ts">
	let { text }: { text: string } = $props();
	const isDigit = (ch: string) => ch >= '0' && ch <= '9';
</script>

<span class="sr">{text}</span><span aria-hidden="true">{#each [...text] as ch, i (i)}<span class:d={isDigit(ch)}>{ch}</span>{/each}</span>

<style>
	.d {
		display: inline-block;
		width: var(--digit-w, 0.62em);
		text-align: center;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
