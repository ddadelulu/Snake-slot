import type { WidgetSnapshot } from './snapshot';

/** The web build has no home-screen widgets: nothing is stored. */
export const WIDGETS_SUPPORTED: boolean = false;

export async function writeWidgetSnapshot(_snapshot: WidgetSnapshot): Promise<void> {}
