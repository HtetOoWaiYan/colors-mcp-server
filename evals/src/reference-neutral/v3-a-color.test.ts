/**
 * Tests of the neutral-v3 author-A reference (v3-a-color.ts): published vectors where they exist, and
 * cross-checks against colorjs.io wherever it implements the same thing.
 */
import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { deltaE2000, hexToRgb, oklabToRgb, type Vec3 } from "../reference/color.js";
import { mulberry32 } from "../tasks/build/common.js";
import { deltaE94GraphicArts, labOfHex } from "./a-deltae.js";
import { fromPolar, srgbToOklchV, srgbToXyz } from "./a-spaces.js";
import {
	bt2020NarrowCode,
	CIE94_GRAPHIC_ARTS,
	CIE94_TEXTILES,
	deltaE94,
	deltaE2000Terms,
	deltaECmc,
	maxSrgbChroma,
	mccamyCct,
	xyzToUvPrime,
	xyzToXyY,
} from "./v3-a-color.js";

const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0xffffff)
		.toString(16)
		.padStart(6, "0")}`;

describe("CIEDE2000 with exposed terms", () => {
	// Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes,
	// supplementary test data, and mathematical observations", Table 1 (selected pairs).
	const SHARMA: [Vec3, Vec3, number][] = [
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
		[[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
		[[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
		[[50, 0, 0], [50, -1, 2], 2.3669],
		[[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
		[[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
		[[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[50, 2.5, 0], [61, -5, 29], 22.8977],
		[[50, 2.5, 0], [56, -27, -3], 31.903],
		[[50, 2.5, 0], [58, 24, 15], 19.4535],
		[[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
	];
	it.each(SHARMA)("Sharma pair %j / %j = %f", (a, b, want) => {
		expect(deltaE2000Terms(a, b).dE).toBeCloseTo(want, 4);
		expect(deltaE2000Terms(b, a).dE).toBeCloseTo(want, 4);
	});

	it("matches the v1 CIEDE2000 and colorjs.io on random sRGB pairs; terms recombine to the total", () => {
		const rnd = mulberry32(3025);
		let devV1 = 0;
		let devCjs = 0;
		for (let i = 0; i < 2000; i++) {
			const a = labOfHex(randHex(rnd));
			const b = labOfHex(randHex(rnd));
			const t = deltaE2000Terms(a, b);
			devV1 = Math.max(devV1, Math.abs(t.dE - deltaE2000(a, b)));
			devCjs = Math.max(devCjs, Math.abs(t.dE - new Color("lab", [...a]).deltaE(new Color("lab", [...b]), "2000")));
			expect(Math.sqrt(t.tL ** 2 + t.tC ** 2 + t.tH ** 2 + t.RT * t.tC * t.tH)).toBeCloseTo(t.dE, 9);
		}
		console.log(`CIEDE2000 terms: max |dev| vs v1 ${devV1}, vs colorjs.io ${devCjs}`);
		expect(devV1).toBeLessThan(1e-9);
		expect(devCjs).toBeLessThan(1e-6);
	});

	it("signs are sample minus reference", () => {
		const t = deltaE2000Terms([50, 20, 0], [55, 30, 0]);
		expect(t.tL).toBeGreaterThan(0);
		expect(t.tC).toBeGreaterThan(0);
		expect(Math.abs(t.tH)).toBeLessThan(1e-9);
		const r = deltaE2000Terms([50, 20, 0], [50, 0, 20]);
		expect(r.tH).toBeGreaterThan(0); // counter-clockwise hue rotation of the sample
	});
});

describe("CIE94 with parametric weights", () => {
	it("graphic-arts weights reproduce the v1 implementation", () => {
		const rnd = mulberry32(3021);
		for (let i = 0; i < 500; i++) {
			const a = labOfHex(randHex(rnd));
			const b = labOfHex(randHex(rnd));
			expect(deltaE94(a, b, CIE94_GRAPHIC_ARTS)).toBeCloseTo(deltaE94GraphicArts(a, b), 10);
		}
	});
	it("textiles: pure lightness difference is halved; chroma weighting uses the reference", () => {
		expect(deltaE94([50, 0, 0], [55, 0, 0], CIE94_TEXTILES)).toBeCloseTo(2.5, 12);
		// pure chroma difference 10 with reference chroma 40: 10 / (1 + 0.048·40)
		expect(deltaE94([50, 40, 0], [50, 30, 0], CIE94_TEXTILES)).toBeCloseTo(10 / (1 + 0.048 * 40), 12);
		expect(deltaE94([50, 30, 0], [50, 40, 0], CIE94_TEXTILES)).toBeCloseTo(10 / (1 + 0.048 * 30), 12);
	});
});

describe("CMC l:c", () => {
	it("agrees with colorjs.io (standard = the color the method is called on) for 2:1 and 1:1", () => {
		const rnd = mulberry32(3022);
		let dev = 0;
		for (let i = 0; i < 2000; i++) {
			const a = labOfHex(randHex(rnd));
			const b = labOfHex(randHex(rnd));
			const A = new Color("lab", [...a]);
			const B = new Color("lab", [...b]);
			dev = Math.max(
				dev,
				Math.abs(deltaECmc(a, b, 2, 1) - A.deltaE(B, { method: "CMC", l: 2, c: 1 } as never)),
				Math.abs(deltaECmc(a, b, 1, 1) - A.deltaE(B, { method: "CMC", l: 1, c: 1 } as never)),
			);
		}
		console.log(`CMC max |dev| vs colorjs.io over 2000 pairs: ${dev}`);
		expect(dev).toBeLessThan(1e-9);
	});
	it("hand-computed value: pure lightness difference at L1 = 50", () => {
		const SL = (0.040975 * 50) / (1 + 0.01765 * 50);
		expect(deltaECmc([50, 0, 0], [52, 0, 0], 1, 1)).toBeCloseTo(2 / SL, 12);
		expect(deltaECmc([50, 0, 0], [52, 0, 0], 2, 1)).toBeCloseTo(1 / SL, 12);
	});
});

describe("chromaticity and McCamy CCT", () => {
	it("white sits on D65 (x 0.3127, y 0.3290; u' 0.1978, v' 0.4683), and so does every gray", () => {
		for (const h of ["#ffffff", "#7e7e7e", "#0b0b0b"]) {
			const X = srgbToXyz(hexToRgb(h));
			const [x, y] = xyzToXyY(X);
			expect(x).toBeCloseTo(0.3127, 4);
			expect(y).toBeCloseTo(0.329, 4);
			const [u, v] = xyzToUvPrime(X);
			expect(u).toBeCloseTo(0.1978, 4);
			expect(v).toBeCloseTo(0.4683, 4);
		}
		expect(xyzToXyY([0, 0, 0])).toEqual([0.3127, 0.329, 0]);
	});
	it("agrees with colorjs.io xy and uv", () => {
		const rnd = mulberry32(3033);
		let dev = 0;
		for (let i = 0; i < 1000; i++) {
			const h = randHex(rnd);
			const X = srgbToXyz(hexToRgb(h));
			const c = new Color(h);
			const mine = [...xyzToXyY(X).slice(0, 2), ...xyzToUvPrime(X)];
			// biome-ignore lint/suspicious/noExplicitAny: colorjs.io registers xy/uv getters at runtime
			const theirs = [...(c as any).xy, ...(c as any).uv] as number[];
			dev = Math.max(dev, ...mine.map((m, k) => Math.abs(m - (theirs[k] as number))));
		}
		console.log(`xy/u'v' max |dev| vs colorjs.io over 1000 colors: ${dev}`);
		expect(dev).toBeLessThan(2e-4);
	});
	it("McCamy (1992): D65 ≈ 6504 K, CIE illuminant A ≈ 2856 K (the formula's published accuracy is a few kelvin)", () => {
		expect(Math.abs(mccamyCct(0.3127, 0.329) - 6504)).toBeLessThan(3);
		expect(Math.abs(mccamyCct(0.44757, 0.40745) - 2856)).toBeLessThan(3);
	});
});

describe("Oklch maximum sRGB chroma", () => {
	it("the boundary color has a channel at 0 or 1, and colorjs.io's gamut test brackets it", () => {
		const rnd = mulberry32(3045);
		for (let i = 0; i < 200; i++) {
			const L = 0.1 + 0.8 * rnd();
			const h = 360 * rnd();
			const m = maxSrgbChroma(L, h);
			const rgb = oklabToRgb(fromPolar([L, m, h]));
			expect(Math.min(...rgb.map((v) => Math.min(Math.abs(v), Math.abs(1 - v))))).toBeLessThan(1e-6);
			expect(new Color("oklch", [L, Math.max(0, m - 0.002), h]).inGamut("srgb")).toBe(true);
			expect(new Color("oklch", [L, m + 0.002, h]).inGamut("srgb")).toBe(false);
		}
	});
	it("a hex with a channel at 0 or 255 is on the boundary (100% of the maximum)", () => {
		const [L, C, h] = srgbToOklchV(hexToRgb("#ff6a13"));
		expect(maxSrgbChroma(L, h)).toBeCloseTo(C, 6);
	});
});

describe("BT.2020 narrow-range codes", () => {
	it("black and nominal peak sit at the BT.2020-2 Table 5 code values", () => {
		expect(bt2020NarrowCode(0)).toBe(64);
		expect(bt2020NarrowCode(1)).toBe(940);
		expect(bt2020NarrowCode(0, 12)).toBe(256);
		expect(bt2020NarrowCode(1, 12)).toBe(3760);
		expect(bt2020NarrowCode(0, 8)).toBe(16);
		expect(bt2020NarrowCode(1, 8)).toBe(235);
	});
});
