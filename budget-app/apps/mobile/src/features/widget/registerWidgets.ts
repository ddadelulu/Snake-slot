/**
 * Registers the background widget renderer. Only Android has one (`registerWidgets.android.ts`);
 * iOS widgets are SwiftUI and read the snapshot themselves, the web has no widgets.
 */
export function registerWidgets(): void {}
