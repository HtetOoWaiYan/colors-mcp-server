import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../tasks/build/common.js";
import {
	compositeOver,
	contrastRatio,
	contrastRatioRgb,
	deltaE2000,
	gamutMapOklch,
	hexToRgb,
	hueDiff,
	inGamut,
	oklabToRgb,
	oklchToRgb,
	type Rgb,
	rgbToHex,
	rgbToLab,
	rgbToOklab,
	rgbToOklch,
	simulateDeuteranopia,
	type Vec3,
} from "./color.js";

describe("hex", () => {
	it("round-trips and expands shorthand", () => {
		expect(rgbToHex(hexToRgb("#abc"))).toBe("#aabbcc");
		expect(rgbToHex(hexToRgb("#663399"))).toBe("#663399");
	});
	it("rejects non-hex", () => {
		expect(() => hexToRgb("red")).toThrow();
		expect(() => hexToRgb("#12")).toThrow();
	});
});

describe("WCAG contrast vectors", () => {
	it("black on white is 21:1", () => {
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
	});
	it("same color is 1:1", () => {
		expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 9);
	});
	it("#777 on white is about 4.48", () => {
		expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.478, 2);
	});
	it("#767676 on white just passes 4.5", () => {
		expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
	});
	it("composites alpha over a base", () => {
		const out = compositeOver([0, 0, 0], 0.5, [1, 1, 1]);
		expect(out[0]).toBeCloseTo(0.5, 9);
	});
});

describe("CIEDE2000 (Sharma et al. 2005 test data)", () => {
	const cases: [Vec3, Vec3, number][] = [
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
		[[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
		[[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
		[[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
		[[50, 2.5, 0], [50, 0, -2.5], 4.3065],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[50, 2.5, 0], [61, -5, 29], 22.8977],
		[[50, 2.5, 0], [56, -27, -3], 31.903],
		[[50, 2.5, 0], [58, 24, 15], 19.4535],
		[[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
		[[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
		[[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
		[[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
		[[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
		[[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
		[[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
		[[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
		[[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
	];
	for (const [a, b, expected] of cases) {
		it(`pair ${a.join(",")} vs ${b.join(",")}`, () => {
			expect(deltaE2000(a, b)).toBeCloseTo(expected, 3);
			expect(deltaE2000(b, a)).toBeCloseTo(expected, 3);
		});
	}
});

describe("Oklab", () => {
	it("white is L=1, a=b=0", () => {
		const [L, a, b] = rgbToOklab([1, 1, 1]);
		expect(L).toBeCloseTo(1, 4);
		expect(Math.abs(a)).toBeLessThan(1e-4);
		expect(Math.abs(b)).toBeLessThan(1e-4);
	});
	it("matches Ottosson's published red", () => {
		const [L, a, b] = rgbToOklab([1, 0, 0]);
		expect(L).toBeCloseTo(0.6279554, 4);
		expect(a).toBeCloseTo(0.224863, 4);
		expect(b).toBeCloseTo(0.1258463, 4);
	});
	it("round-trips", () => {
		const rgb: Rgb = [0.2, 0.5, 0.8];
		const back = oklabToRgb(rgbToOklab(rgb));
		for (let i = 0; i < 3; i++)
			expect(back[i]).toBeCloseTo(rgb[i] as number, 6);
	});
});

describe("gamut mapping", () => {
	it("returns in-gamut colors unchanged", () => {
		const c = rgbToOklch([0.3, 0.4, 0.5]);
		expect(gamutMapOklch(c).oklch.C).toBeCloseTo(c.C, 9);
	});
	it("reduces chroma only, keeping L and H, for out-of-gamut input", () => {
		const input = { L: 0.7, C: 0.4, H: 150 };
		expect(inGamut(oklchToRgb(input))).toBe(false);
		const { oklch, rgb } = gamutMapOklch(input);
		expect(oklch.L).toBe(0.7);
		expect(oklch.H).toBe(150);
		expect(oklch.C).toBeLessThan(0.4);
		expect(inGamut(rgb)).toBe(true);
		// largest chroma that fits: a hair more leaves the gamut
		expect(inGamut(oklchToRgb({ ...oklch, C: oklch.C + 1e-5 }))).toBe(false);
	});
});

describe("hueDiff", () => {
	it("is circular", () => {
		expect(hueDiff(350, 10)).toBeCloseTo(20, 9);
		expect(hueDiff(10, 350)).toBeCloseTo(20, 9);
		expect(hueDiff(0, 180)).toBeCloseTo(180, 9);
		expect(hueDiff(90, 90)).toBe(0);
	});
});

describe("deuteranopia (Machado 2009, severity 1.0)", () => {
	it("leaves neutrals unchanged", () => {
		const out = simulateDeuteranopia([0.5, 0.5, 0.5]);
		for (let i = 0; i < 3; i++) expect(out[i]).toBeCloseTo(0.5, 3);
	});
	it("collapses red and green toward the same hue family", () => {
		const r = rgbToOklch(simulateDeuteranopia([1, 0, 0]));
		const g = rgbToOklch(simulateDeuteranopia([0, 0.6, 0]));
		// the 120+ degrees between red and green shrink to one yellow/olive band
		expect(Math.min(r.H, g.H)).toBeGreaterThan(40);
		expect(Math.max(r.H, g.H)).toBeLessThan(130);
	});
});

describe("cross-check against colorjs.io (guards the hand-written math)", () => {
	const rnd = mulberry32(12345);
	const samples: Rgb[] = Array.from({ length: 200 }, () => [
		rnd(),
		rnd(),
		rnd(),
	]);

	it("Oklab agrees within 2e-4", () => {
		for (const s of samples) {
			const ref = new Color("srgb", [...s]).to("oklab").coords as number[];
			const mine = rgbToOklab(s);
			for (let i = 0; i < 3; i++)
				expect(Math.abs((ref[i] as number) - (mine[i] as number))).toBeLessThan(
					2e-4,
				);
		}
	});

	// colorjs deltaE uses D50 Lab, so dE itself is verified against the Sharma vectors instead
	it("D65 Lab agrees with colorjs lab-d65 within 0.1", () => {
		for (const s of samples) {
			const ref = new Color("srgb", [...s]).to("lab-d65").coords as number[];
			const mine = rgbToLab(s);
			for (let i = 0; i < 3; i++)
				expect(Math.abs((ref[i] as number) - (mine[i] as number))).toBeLessThan(
					0.1,
				);
		}
	});

	it("WCAG 2.1 contrast agrees within 1e-3", () => {
		for (let i = 0; i + 1 < samples.length; i += 2) {
			const a = samples[i] as Rgb;
			const b = samples[i + 1] as Rgb;
			const ref = new Color("srgb", [...a]).contrastWCAG21(
				new Color("srgb", [...b]),
			);
			expect(Math.abs(ref - contrastRatioRgb(a, b))).toBeLessThan(1e-3);
		}
	});
});
