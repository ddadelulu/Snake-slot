// The snake renderer (brief §8): one custom mesh from the snout to the tail along a smoothed path through cell
// centres. The head is the front of the same strip (one piece: same scales, same light, one ink line), with a
// rigid skull and a neck that curves smoothly into the body on turns. Breathing, swallow bulges, tongue flicks,
// a contact shadow and a scale shader (white scales, pearl sheen driven by angle, time and the blind-light slats).
// It only animates what the book says: positions come from book cells, never from randomness.

import { Container, Geometry, Graphics, Mesh, Shader, Sprite, Texture } from 'pixi.js';
import { softDot } from './BoardView';
import { clock, ease } from './clock';
import { texture } from './assets';

export type Pt = { x: number; y: number };

const NB = 96; // samples along the body, behind the neck
const NH = 34; // samples along the head and neck (snout tip to where the neck meets the body path)
const NT = NH + NB;
// The head's design grid: HEAD_PX units = HEAD_CELLS cells (times headScale), v from 0 at the snout end to 1 at the
// neck end. The head's width profile, the eyes, nostrils, mouth and tongue are all placed on it.
const HEAD_PX = 256;
const HEAD_CELLS = 1.8;
const HEAD_TIP = 0.07; // v of the snout tip
const HEAD_PIVOT = 0.34; // v between the eyes: the head's anchor on the path
const HEAD_JAW = 0.57; // v at the back of the jaw: rigid ahead of it, the neck bends behind it
const NECK = 0.75; // cells behind the jaw over which the neck curves from the head's heading into the body path
const EYE_X = 34.6, EYE_Y = -7.7, EYE_R = 13.3; // eye centre and radius on the grid, relative to the pivot
const smooth = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};
/** Half-width of the head as a fraction of the grid at v: rounded snout, broad jaw, taper into the neck. */
const headHalf = (v: number) =>
	v < 0.2
		? 0.14 * Math.sqrt(Math.max(0, 1 - ((0.2 - v) / (0.2 - HEAD_TIP)) ** 2))
		: v < 0.5
			? 0.14 + 0.11 * smooth(0.2, 0.5, v)
			: 0.25 - 0.085 * smooth(0.5, 0.72, v);
const VERT = `
in vec2 aPosition;
in vec2 aUV;
in vec2 aTan;
in vec2 aT;                                         // x: 0..1 snout to tail, y: snout cap (see SHADOW_VERT)
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
    vT = aT.x;
}`;

// Soft contact shadow: the body strip itself, pushed down-right and widened in the vertex shader, fading to
// the edges. It shares the body's geometry, so it costs one extra draw and no per-frame tessellation.
const SHADOW_VERT = `
in vec2 aPosition;
in vec2 aUV;
in vec2 aTan;
in vec2 aT;
out float vAcross;
out float vT;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uExpand;
uniform float uCap;
uniform vec2 uOffset;
void main() {
    float side = 1.0 - 2.0 * aUV.y;                 // +1 on the +normal edge, -1 on the other
    vec2 nrm = vec2(-aTan.y, aTan.x);
    // aT.y: 1 at the snout tip fading to 0 just behind it; pushes the edge forward so it rounds the snout too
    vec2 p = aPosition + nrm * side * uExpand - aTan * uExpand * aT.y * uCap + uOffset;
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
    vAcross = side;
    vT = aT.x;
}`;

const SHADOW_FRAG = `
in float vAcross;
in float vT;
uniform float uAlpha;
void main() {
    float a = uAlpha * smoothstep(0.0, 0.85, 1.0 - abs(vAcross));
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

// Cartoon ink line (D-042): the body strip widened a little, solid dark ink with a soft outer edge, drawn
// under the body. Shares the body geometry like the shadow.
const OUTLINE_FRAG = `
in float vAcross;
in float vT;
uniform float uAlpha;
void main() {
    float a = uAlpha * smoothstep(0.0, 0.12, 1.0 - abs(vAcross));
    gl_FragColor = vec4(vec3(0.078, 0.051, 0.02) * a, a);
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
uniform float uShade;

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
    // white scales: cool fill in the shadows, warm tungsten key on the lit flank
    vec3 base = tex.rgb * (vec3(0.42, 0.44, 0.5) + vec3(1.0, 0.94, 0.84) * diff);
    float hue = fract(0.55 + 0.35 * dot(vTan, vec2(0.7, 0.7)) + uTime * 0.035 + vUV.x * 0.08);
    vec3 irid = hsv2rgb(vec3(hue, 0.4, 1.0));
    float iridAmt = spec * (0.3 + 0.9 * slat) + 0.3 * pow(1.0 - nz, 3.0) * diff;
    vec3 col = base + vec3(1.0, 0.95, 0.86) * spec * (0.3 + 0.6 * slat) + irid * iridAmt * 0.35 + vec3(0.55, 0.65, 0.85) * rim * 0.25;
    // tints, not added light: white scales are already near full brightness
    // wild: warm gold over the body, and a glint running along it (after the moves)
    col *= mix(vec3(1.0), vec3(1.0, 0.88, 0.62), uWild * 0.45 * nz);
    float g = exp(-pow((vT - uGlint) * 9.0, 2.0)) * uGlintOn;
    col = mix(col, vec3(1.0, 0.8, 0.38) * (0.8 + 0.3 * nz), g * 0.6);
    // OUROBOROS ring ignition: venom light racing along the scales
    float race = fract(vUV.x * 0.25 - uTime * 1.6);
    float ring = uRing * (0.35 + 0.65 * smoothstep(0.75, 1.0, race)) * (0.4 + 0.6 * nz);
    col = mix(col, vec3(0.24, 1.0, 0.54) * (0.55 + 0.55 * nz), clamp(ring, 0.0, 1.0) * 0.75);
    float a = smoothstep(0.0, 0.08, vUV.y) * smoothstep(1.0, 0.92, vUV.y);
    gl_FragColor = vec4(col * uShade * a, a);
}`;

type Bulge = { pos: number; speed: number; amp: number };

export class SnakeView extends Container {
	cell: number;
	private mesh: Mesh<Geometry, Shader>;
	private geom: Geometry;
	private pos = new Float32Array(NT * 2 * 2);
	private uv = new Float32Array(NT * 2 * 2);
	private tan = new Float32Array(NT * 2 * 2);
	private tt = new Float32Array(NT * 2 * 2); // per vertex: along (0..1), snout cap
	/** Per-row scratch for the strip: distance along, centre, unit tangent, half-width, inner-edge cuts. */
	private rows = {
		rs: new Float32Array(NT),
		rx: new Float32Array(NT),
		ry: new Float32Array(NT),
		rtx: new Float32Array(NT),
		rty: new Float32Array(NT),
		rh: new Float32Array(NT),
		cut0: new Float32Array(NT), // inner-edge cut on the +normal side
		cut1: new Float32Array(NT), // and on the other side
	};
	private shadow: Mesh<Geometry, Shader>;
	private outline: Mesh<Geometry, Shader>;
	/** Eyes and nostrils, drawn over the head end of the strip on the head's design grid. */
	private face = new Graphics();
	/** The gape shown while the snake gulps a pearl. */
	private mouth = new Graphics();
	private tongueRig = new Container(); // under the head
	private headRig = new Container(); // face and eye glows, over the head; both rigs sit on the pivot between the eyes
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
	/** Overall brightness of body and head (the guardian sits a little back so the hunting snake leads). */
	shade = 1;
	private uni: { uniforms: Record<string, number> };

	constructor(cell: number) {
		super();
		this.cell = cell;
		const idx: number[] = [];
		for (let i = 0; i < NT - 1; i++) {
			const a = i * 2;
			idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
		this.geom = new Geometry({
			attributes: {
				aPosition: { buffer: this.pos, format: 'float32x2' },
				aUV: { buffer: this.uv, format: 'float32x2' },
				aTan: { buffer: this.tan, format: 'float32x2' },
				aT: { buffer: this.tt, format: 'float32x2' },
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
					uShade: { value: 1, type: 'f32' },
				},
			},
		});
		this.uni = shader.resources.snake;
		this.mesh = new Mesh({ geometry: this.geom, shader });
		// soft contact shadow (no blur filter and no per-frame stroke tessellation: both are costly on phones)
		this.shadow = new Mesh({
			geometry: this.geom,
			shader: Shader.from({
				gl: { vertex: SHADOW_VERT, fragment: SHADOW_FRAG },
				resources: {
					shadow: {
						uExpand: { value: cell * 0.1, type: 'f32' },
						uCap: { value: 0.3, type: 'f32' },
						uOffset: { value: new Float32Array([cell * 0.06, cell * 0.1]), type: 'vec2<f32>' },
						uAlpha: { value: 0.5, type: 'f32' },
					},
				},
			}),
		});
		this.tongue = new Sprite(texture('snake_tongue'));
		this.tongue.anchor.set(0.5, 1);
		this.tongue.scale.set(0);
		this.tongueRig.addChild(this.tongue);
		this.outline = new Mesh({
			geometry: this.geom,
			shader: Shader.from({
				gl: { vertex: SHADOW_VERT, fragment: OUTLINE_FRAG },
				resources: {
					shadow: {
						uExpand: { value: cell * 0.05, type: 'f32' },
						uCap: { value: 1, type: 'f32' },
						uOffset: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
						uAlpha: { value: 1, type: 'f32' },
					},
				},
			}),
		});
		this.drawFace();
		// ink and shadow under the body; the tongue comes out from under the snout
		this.addChild(this.shadow, this.tongueRig, this.outline, this.mesh);
		this.headRig.addChild(this.face, this.mouth);
		// eye glows on the head grid, relative to the anchor
		for (const sx of [-1, 1]) {
			const e = new Sprite(softDot());
			e.anchor.set(0.5);
			e.position.set(sx * EYE_X, EYE_Y);
			e.width = e.height = 58;
			e.tint = 0x3dff8a;
			e.blendMode = 'add';
			e.alpha = 0;
			this.eyes.push(e);
			this.headRig.addChild(e);
		}
		this.addChild(this.headRig);
		this.visible = false;
	}

	/** Big glossy cartoon eyes (D-042) and nostrils, plus the gape for a gulp, on the head grid. */
	private drawFace() {
		const f = this.face;
		const R = EYE_R;
		for (const sx of [-1, 1]) {
			const ex = sx * EYE_X, ey = EYE_Y;
			f.ellipse(ex, ey, R * 1.2, R * 1.14).fill(0x040406); // ink socket
			f.circle(ex, ey, R).fill(0x0a0807); // black glassy eye
			f.circle(ex, ey, R * 0.86).stroke({ width: R * 0.16, color: 0x805928, alpha: 0.85 }); // thin warm iris rim
			f.ellipse(ex, ey, R * 0.16, R * 0.8).fill(0x000000); // slit pupil
			f.ellipse(ex - R * 0.36, ey - R * 0.45, R * 0.3, R * 0.29).fill({ color: 0xfffaee, alpha: 0.92 }); // catchlights
			f.circle(ex + R * 0.34, ey + R * 0.42, R * 0.12).fill({ color: 0xfffaee, alpha: 0.67 });
			f.ellipse(sx * 11.5, -57.6, 2.4, 1.6).fill(0x3a3634); // nostril
		}
		const m = this.mouth;
		m.poly([-13, -64, 13, -64, 7, -40, -7, -40]).fill(0x58121e);
		m.poly([-8, -61, 8, -61, 4, -45, -4, -45]).fill(0x8c2838);
		for (const sx of [-1, 1]) m.poly([sx * 12, -63, sx * 8.5, -63, sx * 10.2, -52]).fill(0xece4d2); // fangs
		m.visible = false;
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
	async step(to: Pt, grow: boolean, ms: number, bite = false, e: (t: number) => number = ease.inOut) {
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
		await clock.tween(ms, (t) => (this.stepT = t), e);
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
		await clock.wait(ms);
		this.mouthOpen = false;
	}

	flick() {
		// shoot out, waggle the fork twice, draw back in
		const tg = this.tongue;
		void clock.tween(420, (t) => {
			const out = t < 0.25 ? ease.out(t / 0.25) : t > 0.75 ? 1 - ease.inOut((t - 0.75) / 0.25) : 1;
			const w = t > 0.2 && t < 0.8 ? Math.sin(((t - 0.2) / 0.6) * Math.PI * 4) : 0;
			tg.scale.set(0.5 * out * (1 + 0.12 * w), 0.9 * out * (1 - 0.06 * Math.abs(w)));
			tg.rotation = 0.07 * w;
		}, ease.linear).then(() => {
			tg.scale.set(0);
			tg.rotation = 0;
		});
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
		u.uShade = this.shade;
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
				for (let k = 0; k < 12; k++) {
					const t = k / 12, t2 = t * t, t3 = t2 * t;
					dense.push({
						x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
						y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
					});
				}
			}
			dense.push(poly[poly.length - 1]);
		}
		const cum = [0];
		for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
		// the head's design grid in board units
		const hs = ((c * HEAD_CELLS) / HEAD_PX) * this.headScale * (this.mouthOpen ? 1.06 : 1);
		const grid = HEAD_PX * hs;
		const sTip = (HEAD_TIP - HEAD_PIVOT) * grid; // distances along the strip: negative ahead of the pivot
		const jawLen = (HEAD_JAW - HEAD_PIVOT) * grid;
		const neckLen = c * NECK * this.headScale;
		// a hatchling still gets a neck and a short tail behind the jaw (the path runs on past the last centre)
		const minLen = jawLen + c * 0.55;
		const total = Math.max(cum[cum.length - 1], minLen);
		const sEnd = Math.max(minLen, total * this.enterClip); // the entry reveals the body behind the head
		// queries come in nearly increasing order (s - 2, s, s + 2 as s grows), so a moving cursor replaces
		// a scan from the start for every sample
		let jc = 1;
		const sample = (s: number): Pt => {
			if (dense.length < 2) return dense[0];
			let j = jc;
			while (j > 1 && cum[j - 1] >= s) j--;
			while (j < cum.length - 1 && cum[j] < s) j++;
			jc = j;
			const a = dense[j - 1], b = dense[j];
			const seg = cum[j] - cum[j - 1] || 1;
			// past the last centre the path carries straight on (short snakes)
			const t = Math.max(0, j === cum.length - 1 ? (s - cum[j - 1]) / seg : Math.min(1, (s - cum[j - 1]) / seg));
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
		};
		// Head heading: the chord to a point a little way back along the path, so the head swings round with the
		// curve as it moves into a turn rather than snapping to the new direction; eased so jumps never pop.
		const hp = poly[0];
		const back = sample(c * 0.4);
		if (back.x !== hp.x || back.y !== hp.y) {
			let dA = Math.atan2(hp.y - back.y, hp.x - back.x) - this.headAngle;
			while (dA > Math.PI) dA -= 2 * Math.PI;
			while (dA < -Math.PI) dA += 2 * Math.PI;
			this.headAngle += dA * Math.min(1, (dt / 1000) * 16 * clock.speed);
		}
		this.look += (this.lookTarget - this.look) * Math.min(1, (dt / 1000) * 3);
		const heading = this.headAngle + this.look;
		const hdx = Math.cos(heading), hdy = Math.sin(heading);
		// The spine of the whole strip: straight along the heading from the snout to the back of the jaw (the skull
		// is rigid), then a Hermite curve that leaves the jaw along the heading and joins the body path, tangent to
		// it, NECK cells further back. The neck has no kink and no hairpin, so it never folds over on a turn.
		const ax = hp.x - hdx * jawLen, ay = hp.y - hdy * jawLen;
		const sJoin = jawLen + neckLen;
		const tw = c * 0.1; // tangents span a tenth of a cell either side, so normals turn smoothly over path kinks
		const J = sample(sJoin), J0 = sample(sJoin - tw), J1 = sample(sJoin + tw);
		const L = Math.hypot(J.x - ax, J.y - ay) || neckLen;
		const jl = Math.hypot(J1.x - J0.x, J1.y - J0.y) || 1;
		const m0x = -hdx * L, m0y = -hdy * L, m1x = ((J1.x - J0.x) / jl) * L, m1y = ((J1.y - J0.y) / jl) * L;
		const spine = (s: number): Pt => {
			if (s <= jawLen) return { x: hp.x - hdx * s, y: hp.y - hdy * s };
			if (s >= sJoin) return sample(s);
			const t = (s - jawLen) / neckLen, t2 = t * t, t3 = t2 * t;
			const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = 3 * t2 - 2 * t3, h11 = t3 - t2;
			return { x: h00 * ax + h10 * m0x + h01 * J.x + h11 * m1x, y: h00 * ay + h10 * m0y + h01 * J.y + h11 * m1y };
		};
		// bulges travel toward the tail
		for (const b of this.bulges) b.pos += (b.speed * dt * clock.speed) / 1000;
		this.bulges = this.bulges.filter((b) => b.pos * c < total + c * 0.5);
		const W = c * 0.56;
		const breath = 1 + 0.035 * Math.sin(clock.time * 2 * Math.PI * 0.33);
		const texLen = c * 1.15; // one texture repeat per ~1.15 cells
		const sHead = Math.min(sJoin, sEnd);
		const taper = Math.min(1.2, Math.max(0.3, (sEnd - jawLen) / c)); // cells over which the tail tapers
		const { rs, rx, ry, rtx, rty, rh } = this.rows;
		for (let i = 0; i < NT; i++) {
			// rows: the head and neck (denser at the snout, to round it), then the body to the visible end
			const x = i / (NH - 1);
			const s = i < NH ? sTip + (sHead - sTip) * (0.5 * x + 0.5 * x * x) : sHead + ((sEnd - sHead) * (i - NH + 1)) / NB;
			const p = spine(s);
			const p2 = spine(Math.min(s + tw, sEnd));
			const p1 = spine(s - tw);
			let tx = p2.x - p1.x, ty = p2.y - p1.y;
			const tl = Math.hypot(tx, ty) || 1;
			tx /= tl;
			ty /= tl;
			// width: the head's profile, blending behind the jaw into the body, which breathes, carries the swallow
			// bulges and ends in a short, rounded taper (not a long spike)
			const fromTail = (sEnd - s) / c;
			let body = W * 0.5 * breath * (0.2 + 0.8 * Math.sqrt(Math.min(1, Math.max(0, fromTail) / taper)));
			for (const b of this.bulges) {
				const d = s / c - b.pos;
				body *= 1 + b.amp * Math.exp(-d * d * 7);
			}
			const v = HEAD_PIVOT + s / grid;
			const k = smooth(0.6, 0.85, v);
			rs[i] = s;
			rx[i] = p.x;
			ry[i] = p.y;
			rtx[i] = tx;
			rty[i] = ty;
			rh[i] = k >= 1 ? body : headHalf(v) * grid * (1 - k) + body * k;
		}
		// On a bend tighter than the strip is wide, the inner edge would cross itself (a crumpled crease): hold it
		// inside the radius of curvature, like skin bunching on the inside of the turn. The cut is eased along the
		// strip so it reads as a soft dent, never a notch.
		const { cut0, cut1 } = this.rows;
		cut0.fill(0);
		cut1.fill(0);
		for (let i = 0; i < NT; i++) {
			const a = Math.max(0, i - 2), b = Math.min(NT - 1, i + 2);
			const ds = rs[b] - rs[a];
			if (ds < 1e-3) continue;
			const cross = rtx[a] * rty[b] - rty[a] * rtx[b];
			const r = ds / Math.max(1e-6, Math.asin(Math.min(1, Math.abs(cross))));
			const cut = rh[i] - Math.max(rh[i] * 0.3, r * 0.92 - c * 0.06);
			if (cut <= 0) continue;
			// spread each cut over the neighbouring rows (a tent), keeping the largest
			const reach = Math.max(1, Math.round((c * 0.25) / Math.max(1e-3, ds / (b - a))));
			const side = cross > 0 ? cut0 : cut1;
			for (let j = Math.max(0, i - reach); j <= Math.min(NT - 1, i + reach); j++) {
				side[j] = Math.max(side[j], cut * (1 - Math.abs(j - i) / (reach + 1)));
			}
		}
		for (let i = 0; i < NT; i++) {
			const s = rs[i], tx = rtx[i], ty = rty[i];
			const h0 = Math.max(rh[i] * 0.3, rh[i] - cut0[i]), h1 = Math.max(rh[i] * 0.3, rh[i] - cut1[i]);
			const o = i * 4;
			this.pos[o] = rx[i] - ty * h0;
			this.pos[o + 1] = ry[i] + tx * h0;
			this.pos[o + 2] = rx[i] + ty * h1;
			this.pos[o + 3] = ry[i] - tx * h1;
			const uu = s / texLen;
			this.uv[o] = uu;
			this.uv[o + 1] = 0;
			this.uv[o + 2] = uu;
			this.uv[o + 3] = 1;
			this.tan[o] = tx;
			this.tan[o + 1] = ty;
			this.tan[o + 2] = tx;
			this.tan[o + 3] = ty;
			const f = (s - sTip) / (sEnd - sTip);
			const capK = Math.max(0, 1 - (s - sTip) / (c * 0.12));
			this.tt[o] = f;
			this.tt[o + 1] = capK;
			this.tt[o + 2] = f;
			this.tt[o + 3] = capK;
		}
		this.geom.getBuffer('aPosition').update();
		this.geom.getBuffer('aUV').update();
		this.geom.getBuffer('aTan').update();
		this.geom.getBuffer('aT').update();
		for (const rig of [this.tongueRig, this.headRig]) {
			rig.position.set(hp.x, hp.y);
			rig.rotation = heading + Math.PI / 2;
			rig.scale.set(hs);
		}
		const g = Math.round(255 * Math.max(0, Math.min(1, this.shade)));
		this.face.tint = this.mouth.tint = (g << 16) | (g << 8) | g;
		this.mouth.visible = this.mouthOpen;
		this.tongue.y = (HEAD_TIP - HEAD_PIVOT) * HEAD_PX;
		for (const e of this.eyes) e.alpha = this.eyeGlow * (0.75 + 0.25 * Math.sin(clock.time * 7));
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
