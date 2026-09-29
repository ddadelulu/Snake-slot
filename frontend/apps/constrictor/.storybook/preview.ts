import type { Preview } from '@storybook/svelte';
import '../src/app.css';

// Stake viewports (brief Appendix B)
const vp = (name: string, w: number, h: number) => ({ name, styles: { width: `${w}px`, height: `${h}px` } });

const preview: Preview = {
	parameters: {
		layout: 'fullscreen',
		backgrounds: { disable: true },
		viewport: {
			options: {
				desktop: vp('Desktop 1200×675', 1200, 675),
				laptop: vp('Laptop 1024×576', 1024, 576),
				popoutL: vp('Popout L 800×450', 800, 450),
				popoutS: vp('Popout S 400×225', 400, 225),
				mobileL: vp('Mobile L 425×812', 425, 812),
				mobileM: vp('Mobile M 375×667', 375, 667),
				mobileS: vp('Mobile S 320×568', 320, 568),
			},
		},
	},
	initialGlobals: { viewport: { value: 'desktop', isRotated: false } },
};

export default preview;
