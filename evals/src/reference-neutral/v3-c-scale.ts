/**
 * Author C's v3 witness builders for tonal scales: like c-scale.ts's buildScale, but each step may
 * have its own Oklch hue (a hue path), and the seed may sit at any step including either end.
 * Colors are gamut-mapped by Oklch chroma reduction at constant L and h (c-color.ts). The graders
 * never compare against these colors; the task builder only asserts that they pass every check.
 */
import { hexOfOklch, oklchOfHex } from "./c-color.js";
import { SCALE_KEYS } from "./c-scale.js";

/** Hue (degrees) of a piecewise-linear path at position x, interpolating along the shorter arc of each segment. */
export function pathHue(knots: [number, number][], x: number): number {
	const ks = [...knots].sort((a, b) => a[0] - b[0]);
	let i = 0;
	while (i < ks.length - 2 && x > (ks[i + 1] as [number, number])[0]) i++;
	const [x0, h0] = ks[i] as [number, number];
	const [x1, h1] = (ks[i + 1] ?? ks[i]) as [number, number];
	const d = ((((h1 - h0) % 360) + 540) % 360) - 180;
	const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
	return (((h0 + d * t) % 360) + 360) % 360;
}

/** Piecewise-linear Oklch L through the given [position, L] knots (positions 0..10 = steps 50..950). */
export function ladder(knots: [number, number][]): number[] {
	const ks = [...knots].sort((a, b) => a[0] - b[0]);
	return SCALE_KEYS.map((_, i) => {
		let j = 0;
		while (j < ks.length - 2 && i > (ks[j + 1] as [number, number])[0]) j++;
		const [x0, y0] = ks[j] as [number, number];
		const [x1, y1] = (ks[j + 1] ?? ks[j]) as [number, number];
		return x1 === x0 ? y0 : y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
	});
}

/**
 * An 11-step scale: step `seedKey` is the seed hex itself; every other step is (L[i], chroma[i]) at
 * the hue path's hue for that position (or the seed's hue when no path is given), gamut-mapped.
 */
export function buildScale3(
	seed: string,
	seedKey: string | null,
	Ls: number[],
	chroma: number[],
	hueKnots?: [number, number][],
): Record<string, string> {
	const s = oklchOfHex(seed);
	return Object.fromEntries(
		SCALE_KEYS.map((k, i) => [
			k,
			k === seedKey ? seed : hexOfOklch(Ls[i] as number, chroma[i] as number, hueKnots ? pathHue(hueKnots, i) : s.H),
		]),
	);
}
