// The snake renderer (brief §8): a custom mesh along a smoothed path through cell centres, tapered,
// breathing, with swallow bulges, a smoothly turning head sprite, tongue flicks, a contact shadow and a
// scale shader (glossy black, oil-slick iridescence driven by angle, time and the blind-light slats).
// It only animates what the book says: positions come from book cells, never from randomness.

import { Container, Geometry, Graphics, Mesh, Shader, Sprite, Texture } from 'pixi.js';
import { softDot } from './BoardView';
import { clock, ease } from './clock';
import { texture } from './assets';

export type Pt = { x: number; y: number };

const N = 96; // samples along the body
const VERT = `
in vec2 aPosition;
in vec2 aUV;
in vec2 aTan;
in float aT;
out vec2 vUV;
out vec2 vTan;
out float vT;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
    vTan = aTan;
    vT = aT;
}`;

const FRAG = `
in vec2 vUV;
in vec2 vTan;
in float vT;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uSlatPeriod;
uniform float uSlatDrift;
uniform float uGlint;
uniform float uGlintOn;
uniform float uRing;
uniform float uWild;
uniform float uPx;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    float across = vUV.y * 2.0 - 1.0;               // -1..1 across the body
    float nz = sqrt(max(0.0, 1.0 - across * across));
    vec2 side = vec2(-vTan.y, vTan.x);              // screen-space side vector
    vec3 n = normalize(vec3(side * across, nz));
    vec3 L = normalize(vec3(-0.62, -0.62, 0.55));   // tungsten key, upper left
    vec3 R = normalize(vec3(0.8, -0.1, 0.35));      // cool moon rim, right
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    vec4 tex = texture2D(uTexture, vec2(vUV.x, vUV.y));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, H), 0.0), 38.0);
    float rim = pow(1.0 - nz, 2.5) * max(dot(n, R), 0.0);
    // blind slats in screen space (~30 degrees), drifting slowly
    vec2 sp = gl_FragCoord.xy / uPx;
    // gl_FragCoord is y-up: bands at ~30 deg falling left-high to right-low (STYLE_BIBLE 2)
    float slatCoord = (sp.x * 0.5 + sp.y * 0.866) / uSlatPeriod + uSlatDrift;
    float slat = smoothstep(0.62, 0.72, fract(slatCoord)) * (1.0 - smoothstep(0.86, 0.96, fract(slatCoord)));
    vec3 base = tex.rgb * (0.30 + 0.95 * diff);
    float hue = fract(0.55 + 0.35 * dot(vTan, vec2(0.7, 0.7)) + uTime * 0.035 + vUV.x * 0.08);
    vec3 irid = hsv2rgb(vec3(hue, 0.65, 1.0));
    float iridAmt = spec * (0.35 + 1.4 * slat) + 0.25 * pow(1.0 - nz, 3.0) * diff;
    vec3 col = base + vec3(1.0, 0.93, 0.82) * spec * (0.45 + 0.9 * slat) + irid * iridAmt * 0.75 + vec3(0.55, 0.65, 0.85) * rim * 0.35;
    // wild glint running along the body (after the moves)
    float g = exp(-pow((vT - uGlint) * 9.0, 2.0)) * uGlintOn;
    col += vec3(1.0, 0.86, 0.55) * g * (0.35 + 0.65 * nz);
    col += vec3(0.85, 0.7, 0.4) * uWild * 0.10 * nz;
    // OUROBOROS ring ignition: venom light racing along the scales
    float race = fract(vUV.x * 0.25 - uTime * 1.6);
    float ring = uRing * (0.35 + 0.65 * smoothstep(0.75, 1.0, race)) * (0.4 + 0.6 * nz);
    col += vec3(0.24, 1.0, 0.54) * ring;
    float a = smoothstep(0.0, 0.08, vUV.y) * smoothstep(1.0, 0.92, vUV.y);
    gl_FragColor = vec4(col * a, a);
}`;

type Bulge = { pos: number; speed: number; amp: number };

export class SnakeView extends Container {
	cell: number;
	private mesh: Mesh<Geometry, Shader>;
	private geom: Geometry;
	private pos = new Float32Array(N * 2 * 2);
	private uv = new Float32Array(N * 2 * 2);
	private tan = new Float32Array(N * 2 * 2);
	private tt = new Float32Array(N * 2);
	private shadow = new Graphics();
	head: Sprite;
	private headRig = new Container(); // head sprite + tongue (Sprites cannot have children in Pixi 8)
	private eyes: Sprite[] = [];
	/** 0..1: venom-green glow in the eyes (guardian anticipation). */
	eyeGlow = 0;
	/** Extra head scale (the guardian's head is a little smaller relative to its coil). */
	headScale = 1;
	private look = 0;
	private lookTarget = 0;

	/** Turn the head a little toward a global point (guardian idle look); null relaxes it. */
	lookAt(p: { x: number; y: number } | null) {
		if (!p || !this.visible) {
			this.lookTarget = 0;
			return;
		}
		const h = this.headRig.getGlobalPosition();
		let d = Math.atan2(p.y - h.y, p.x - h.x) - this.headAngle;
		while (d > Math.PI) d -= 2 * Math.PI;
		while (d < -Math.PI) d += 2 * Math.PI;
		this.lookTarget = Math.max(-0.3, Math.min(0.3, d * 0.35));
	}
	private tongue: Sprite;
	private mouthOpen = false;
	private headAngle = -Math.PI / 2;
	/** Path of cell centres, head first (board units). */
	path: Pt[] = [];
	/** Fractional motion of the current step: head advances toward headNext, tail toward tailNext. */
	private headFrom: Pt | null = null;
	private headTo: Pt | null = null;
	private tailFrom: Pt | null = null;
	private tailTo: Pt | null = null;
	private stepT = 1;
	private bulges: Bulge[] = [];
	private nextFlick = 3;
	private glint = -1;
	private enterClip = 1; // 0..1 portion of the body revealed (entry animation)
	wild = 0;
	ring = 0;
	private uni: { uniforms: Record<string, number> };

	constructor(cell: number) {
		super();
		this.cell = cell;
		const idx: number[] = [];
		for (let i = 0; i < N - 1; i++) {
			const a = i * 2;
			idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
		this.geom = new Geometry({
			attributes: {
				aPosition: { buffer: this.pos, format: 'float32x2' },
				aUV: { buffer: this.uv, format: 'float32x2' },
				aTan: { buffer: this.tan, format: 'float32x2' },
				aT: { buffer: this.tt, format: 'float32' },
			},
			indexBuffer: new Uint32Array(idx),
		});
		const t = texture('snake_scales_strip');
		t.source.autoGenerateMipmaps = true; // smooth minification (no scale shimmer on small screens)
		t.source.style.mipmapFilter = 'linear';
		t.source.style.addressModeU = 'repeat';
		t.source.style.addressModeV = 'clamp-to-edge';
		t.source.style.update();
		const shader = Shader.from({
			gl: { vertex: VERT, fragment: FRAG },
			resources: {
				uTexture: t.source,
				snake: {
					uTime: { value: 0, type: 'f32' },
					uSlatPeriod: { value: 46, type: 'f32' },
					uSlatDrift: { value: 0, type: 'f32' },
					uGlint: { value: -1, type: 'f32' },
					uGlintOn: { value: 0, type: 'f32' },
					uRing: { value: 0, type: 'f32' },
					uWild: { value: 0, type: 'f32' },
					uPx: { value: 1, type: 'f32' },
				},
			},
		});
		this.uni = shader.resources.snake;
		this.mesh = new Mesh({ geometry: this.geom, shader });
		// soft contact shadow from layered strokes (no blur filter: filters are costly on mobile GPUs)
		this.shadow.alpha = 1;
		this.addChild(this.shadow, this.mesh);
		this.head = new Sprite(texture('snake_head'));
		this.head.anchor.set(0.5, 0.34); // pivot between the eyes; the neck overlaps the body
		this.tongue = new Sprite(texture('snake_tongue'));
		this.tongue.anchor.set(0.5, 1);
		this.tongue.scale.set(0);
		this.headRig.addChild(this.tongue, this.head);
		// eye glows in head-texture pixels relative to the anchor (placeholder/final heads share the layout)
		for (const sx of [-1, 1]) {
			const e = new Sprite(softDot());
			e.anchor.set(0.5);
			e.position.set(sx * 31, -16);
			e.width = e.height = 46;
			e.tint = 0x3dff8a;
			e.blendMode = 'add';
			e.alpha = 0;
			this.eyes.push(e);
			this.headRig.addChild(e);
		}
		this.addChild(this.headRig);
		this.visible = false;
	}

	setPixelRatio(px: number) {
		this.uni.uniforms.uPx = px;
	}

	/** Place the snake on a path (head first) immediately. */
	setPath(path: Pt[]) {
		this.path = path.map((p) => ({ ...p }));
		this.headFrom = this.headTo = this.tailFrom = this.tailTo = null;
		this.stepT = 1;
		if (path.length > 1) this.headAngle = Math.atan2(path[0].y - path[1].y, path[0].x - path[1].x);
		this.visible = path.length > 0;
	}

	/** Animate one step: head slides to `to`; the tail advances unless `grow`. Bite: `to` is the tail cell. */
	async step(to: Pt, grow: boolean, ms: number, bite = false) {
		const from = this.path[0];
		const oldTail = this.path[this.path.length - 1];
		this.headFrom = from;
		this.headTo = to;
		if (!grow) {
			this.tailFrom = oldTail;
			this.tailTo = this.path.length > 1 ? this.path[this.path.length - 2] : to;
		} else {
			this.tailFrom = this.tailTo = null;
		}
		void bite;
		this.stepT = 0;
		await clock.tween(ms, (t) => (this.stepT = t), ease.inOut);
		// commit
		const np = [{ ...to }, ...this.path];
		if (!grow) np.pop();
		this.path = np;
		this.headFrom = this.headTo = this.tailFrom = this.tailTo = null;
		this.stepT = 1;
	}

	addBulge() {
		this.bulges.push({ pos: 0.35, speed: 3.2, amp: 0.34 });
	}

	async gulp(ms: number) {
		this.mouthOpen = true;
		this.head.texture = texture('snake_head_open');
		await clock.wait(ms);
		this.mouthOpen = false;
		this.head.texture = texture('snake_head');
	}

	flick() {
		const tg = this.tongue;
		void clock.tween(260, (t) => {
			const k = t < 0.5 ? t * 2 : (1 - t) * 2;
			tg.scale.set(0.5 * k, 0.9 * k);
		}, ease.linear);
	}

	async glintRun(ms: number) {
		this.uni.uniforms.uGlintOn = 1;
		await clock.tween(ms, (t) => (this.glint = -0.1 + t * 1.2), ease.inOut);
		this.uni.uniforms.uGlintOn = 0;
		this.glint = -1;
	}

	async enter(ms: number) {
		this.enterClip = 0;
		this.visible = true;
		await clock.tween(ms, (t) => (this.enterClip = t), ease.out);
		this.enterClip = 1;
	}

	async exitAlong(points: Pt[], msPerCell: number) {
		// slither off: keep stepping the head along `points` (off-board), shrinking from the tail
		for (const p of points) await this.step(p, false, msPerCell);
		this.visible = false;
	}

	/** Positions of the (possibly moving) head and body polyline for this frame. */
	private currentPolyline(): Pt[] {
		const pts: Pt[] = [];
		const lerp = (a: Pt, b: Pt, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		if (this.headFrom && this.headTo) pts.push(lerp(this.headFrom, this.headTo, this.stepT));
		for (let i = 0; i < this.path.length; i++) {
			const isLast = i === this.path.length - 1;
			if (isLast && this.tailFrom && this.tailTo) {
				pts.push(lerp(this.tailFrom, this.tailTo, this.stepT));
			} else pts.push(this.path[i]);
		}
		return pts;
	}

	update(dt: number) {
		if (!this.visible) return;
		const u = this.uni.uniforms;
		u.uTime = clock.time;
		u.uSlatDrift = clock.time * 0.02;
		u.uGlint = this.glint;
		u.uRing = this.ring;
		u.uWild = this.wild;
		const poly = this.currentPolyline();
		if (poly.length === 0) return;
		const c = this.cell;
		// dense Catmull-Rom sampling
		const dense: Pt[] = [];
		if (poly.length === 1) {
			dense.push(poly[0], { x: poly[0].x, y: poly[0].y + 0.001 });
		} else {
			for (let i = 0; i < poly.length - 1; i++) {
				const p0 = poly[Math.max(0, i - 1)], p1 = poly[i], p2 = poly[i + 1], p3 = poly[Math.min(poly.length - 1, i + 2)];
				for (let k = 0; k < 8; k++) {
					const t = k / 8, t2 = t * t, t3 = t2 * t;
					dense.push({
						x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
						y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
					});
				}
			}
			dense.push(poly[poly.length - 1]);
		}
		// extend the tail slightly past the last centre so a length-1 hatchling still has a body
		const cum = [0];
		for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
		const total = Math.max(cum[cum.length - 1], c * 0.35);
		const visibleLen = total * this.enterClip;
		const startS = Math.min(c * 0.18, total * 0.2); // body starts under the head
		const sample = (s: number): Pt => {
			if (dense.length < 2) return dense[0];
			let j = 1;
			while (j < cum.length - 1 && cum[j] < s) j++;
			const a = dense[j - 1], b = dense[j];
			const seg = cum[j] - cum[j - 1] || 1;
			const t = Math.max(0, Math.min(1, (s - cum[j - 1]) / seg));
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
		};
		// bulges travel toward the tail
		for (const b of this.bulges) b.pos += (b.speed * dt * clock.speed) / 1000;
		this.bulges = this.bulges.filter((b) => b.pos * c < total + c * 0.5);
		const W = c * 0.56;
		const breath = 1 + 0.035 * Math.sin(clock.time * 2 * Math.PI * 0.33);
		const texLen = c * 1.15; // one texture repeat per ~1.15 cells
		const shadowPts: number[] = [];
		for (let i = 0; i < N; i++) {
			const f = i / (N - 1);
			const s = startS + (Math.max(visibleLen, startS + 1) - startS) * f;
			const p = sample(s);
			const p2 = sample(Math.min(s + 2, total));
			const p1 = sample(Math.max(s - 2, 0));
			let tx = p2.x - p1.x, ty = p2.y - p1.y;
			const tl = Math.hypot(tx, ty) || 1;
			tx /= tl;
			ty /= tl;
			// width: neck -> full body -> tapering tail
			const fromTail = (visibleLen - s) / c;
			let w = W * breath * (f < 0.06 ? 0.86 + f * 2.3 : 1) * Math.min(1, 0.18 + fromTail * 0.55);
			for (const b of this.bulges) {
				const d = s / c - b.pos;
				w *= 1 + b.amp * Math.exp(-d * d * 7);
			}
			const nx = -ty * w * 0.5, ny = tx * w * 0.5;
			const o = i * 4;
			this.pos[o] = p.x + nx;
			this.pos[o + 1] = p.y + ny;
			this.pos[o + 2] = p.x - nx;
			this.pos[o + 3] = p.y - ny;
			const uu = s / texLen;
			this.uv[o] = uu;
			this.uv[o + 1] = 0;
			this.uv[o + 2] = uu;
			this.uv[o + 3] = 1;
			this.tan[o] = tx;
			this.tan[o + 1] = ty;
			this.tan[o + 2] = tx;
			this.tan[o + 3] = ty;
			this.tt[i * 2] = f;
			this.tt[i * 2 + 1] = f;
			if (i % 3 === 0) shadowPts.push(p.x + c * 0.06, p.y + c * 0.1);
		}
		this.geom.getBuffer('aPosition').update();
		this.geom.getBuffer('aUV').update();
		this.geom.getBuffer('aTan').update();
		this.geom.getBuffer('aT').update();
		this.shadow.clear();
		if (shadowPts.length >= 4) {
			for (const [k, a] of [[1.35, 0.1], [1.1, 0.12], [0.85, 0.16], [0.6, 0.2]] as const) {
				this.shadow.poly(shadowPts, false).stroke({ width: W * k, color: 0x000000, alpha: a, cap: 'round', join: 'round' });
			}
		}
		// head
		const hp = poly[0];
		const nextP = poly.length > 1 ? poly[1] : { x: hp.x, y: hp.y + 1 };
		const target = Math.atan2(hp.y - nextP.y, hp.x - nextP.x);
		let dA = target - this.headAngle;
		while (dA > Math.PI) dA -= 2 * Math.PI;
		while (dA < -Math.PI) dA += 2 * Math.PI;
		this.headAngle += dA * Math.min(1, (dt / 1000) * 14 * clock.speed);
		this.headRig.position.set(hp.x, hp.y);
		this.look += (this.lookTarget - this.look) * Math.min(1, (dt / 1000) * 3);
		this.headRig.rotation = this.headAngle + Math.PI / 2 + this.look;
		// the head texture's neck is ~31 % of its width; scale it so the neck matches the body width
		const hs = (c * 1.8) / Math.max(1, this.head.texture.width);
		this.tongue.y = -0.27 * this.head.texture.height;
		this.headRig.scale.set(hs * this.headScale * (this.mouthOpen ? 1.06 : 1));
		for (const e of this.eyes) e.alpha = this.eyeGlow * (0.75 + 0.25 * Math.sin(clock.time * 7));
		this.headRig.visible = this.enterClip > 0.02;
		// idle tongue flick every 3-6 s (cosmetic timing)
		this.nextFlick -= dt / 1000;
		if (this.nextFlick <= 0) {
			this.flick();
			this.nextFlick = 3 + ((Math.sin(clock.time * 12.9898) * 43758.5453) % 1 + 1) % 1 * 3;
		}
	}
}

export function makeEmptyTexture(): Texture {
	return Texture.WHITE;
}
