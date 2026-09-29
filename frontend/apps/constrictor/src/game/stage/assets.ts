// Asset manifest loader. static/assets/manifest.json is written by art/pipeline/build_assets.py:
// every entry points to a processed file that came from art/final/ (if present) or art/placeholder/.

import { Assets, Texture } from 'pixi.js';

export type Manifest = {
	version: number;
	images: Record<string, { file: string; source: 'final' | 'placeholder'; w: number; h: number }>;
	audio: Record<string, { file: string; source: 'final' | 'placeholder' }>;
	video: Record<string, { file: string; source: 'final' | 'placeholder' }>;
};

const tex = new Map<string, Texture>();
let manifest: Manifest | null = null;

export const assetBase = () => {
	// Works from any path the CDN serves the build from (relative to index.html).
	return new URL('./assets/', typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href;
};

export async function loadManifest(): Promise<Manifest> {
	if (manifest) return manifest;
	const res = await fetch(assetBase() + 'manifest.json');
	manifest = (await res.json()) as Manifest;
	return manifest;
}

export async function loadTextures(onProgress?: (p: number) => void) {
	const m = await loadManifest();
	const entries = Object.entries(m.images);
	let done = 0;
	await Promise.all(
		entries.map(async ([id, e]) => {
			try {
				const t = (await Assets.load({ src: assetBase() + e.file, alias: id })) as Texture;
				tex.set(id, t);
			} catch {
				/* missing texture: the view falls back to a drawn shape */
			}
			done++;
			onProgress?.(done / entries.length);
		}),
	);
}

export const texture = (id: string): Texture => tex.get(id) ?? Texture.EMPTY;
export const hasTexture = (id: string) => tex.has(id);
export const audioUrl = (id: string) => (manifest?.audio[id] ? assetBase() + manifest.audio[id].file : null);
export const videoUrl = (id: string) => (manifest?.video[id] ? assetBase() + manifest.video[id].file : null);
export const getManifest = () => manifest;
export const imageUrl = (id: string) => (manifest?.images[id] ? assetBase() + manifest.images[id].file : null);
