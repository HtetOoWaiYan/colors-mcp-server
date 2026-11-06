import {
	clamp01,
	gamutMap,
	normHue,
	type Oklch,
	oklabToRgb,
	type Rgb,
	rgbToOklab,
	rgbToOklch,
} from "./color.js";

export type BlendSpace = "oklch" | "oklab" | "srgb";

const ACHROMATIC = 0.004;

function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
	let ha = a.h;
	let hb = b.h;
	// a near-gray end has no meaningful hue: borrow the other end's, as CSS does
	if (a.c < ACHROMATIC) ha = hb;
	if (b.c < ACHROMATIC) hb = ha;
	let dh = hb - ha;
	if (dh > 180) dh -= 360;
	else if (dh < -180) dh += 360;
	return {
		l: a.l + (b.l - a.l) * t,
		c: a.c + (b.c - a.c) * t,
		h: normHue(ha + dh * t),
	};
}

export function mixAt(
	a: Rgb,
	b: Rgb,
	t: number,
	space: BlendSpace = "oklch",
): Rgb {
	if (space === "srgb") {
		return [0, 1, 2].map((i) =>
			clamp01((a[i] as number) + ((b[i] as number) - (a[i] as number)) * t),
		) as Rgb;
	}
	if (space === "oklab") {
		const la = rgbToOklab(a);
		const lb = rgbToOklab(b);
		const lab: [number, number, number] = [
			la[0] + (lb[0] - la[0]) * t,
			la[1] + (lb[1] - la[1]) * t,
			la[2] + (lb[2] - la[2]) * t,
		];
		return oklabToRgb(lab).map(clamp01) as Rgb;
	}
	return gamutMap(mixOklch(rgbToOklch(a), rgbToOklch(b), t)).rgb;
}

export function gradient(
	stops: Rgb[],
	steps: number,
	space: BlendSpace = "oklch",
): Rgb[] {
	if (stops.length < 2) throw new Error("need at least two colors");
	const out: Rgb[] = [];
	const segs = stops.length - 1;
	for (let i = 0; i < steps; i++) {
		const pos = steps === 1 ? 0 : (i / (steps - 1)) * segs;
		const seg = Math.min(segs - 1, Math.floor(pos));
		out.push(mixAt(stops[seg] as Rgb, stops[seg + 1] as Rgb, pos - seg, space));
	}
	return out;
}
