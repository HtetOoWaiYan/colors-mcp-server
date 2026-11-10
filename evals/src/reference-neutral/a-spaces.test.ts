import Color from "colorjs.io";
// rec2020-oetf is not registered by default; register it for the cross-check.
import Rec2020Oetf from "colorjs.io/src/spaces/rec2020-oetf.js";
import { describe, expect, it } from "vitest";
import { hexToRgb, type Rgb, rgbToLab as colorTsLab, type Vec3 } from "../reference/color.js";
import { mulberry32 } from "../tasks/build/common.js";
import {
	bt2020Oetf,
	hslToSrgb,
	hsvToSrgb,
	lchToSrgb,
	labToSrgb,
	oklchToSrgb,
	p3ToSrgb,
	SRGB_TO_XYZ,
	srgbToCmykNaive,
	srgbToHsl,
	srgbToHsv,
	srgbToHwb,
	srgbToLab,
	srgbToLch,
	srgbToLinearRgb,
	srgbToOklabV,
	srgbToOklchV,
	srgbToP3,
	srgbToRec2020,
	srgbToRec2020Linear,
	srgbToXyz,
	XYZ_TO_P3,
} from "./a-spaces.js";

Color.Space.register(Rec2020Oetf);

const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0x1000000)
		.toString(16)
		.padStart(6, "0")}`;
const hueD = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const maxAbs = (a: readonly number[], b: readonly number[]) =>
	Math.max(...a.map((v, i) => Math.abs(v - (b[i] as number))));
const cj = (hex: string, space: string): number[] =>
	new Color(hex).to(space).coords.map((v) => (v === null || Number.isNaN(v) ? 0 : Number(v)));

const SAMPLES = (() => {
	const rnd = mulberry32(303);
	const out = ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff", "#010101", "#fefefe"];
	for (let i = 0; i < 1500; i++) out.push(randHex(rnd));
	return out;
})();

describe("matrices derived from primaries", () => {
	it("sRGB -> XYZ matches the IEC 61966-2-1 / Lindbloom matrix to 3e-4 (white: xy 0.3127/0.3290 vs XYZ 0.95047/1.08883)", () => {
		// Published D65 sRGB matrix (IEC 61966-2-1 Amd.1 rounded to 4 places; Lindbloom 7 places).
		const PUB: Vec3[] = [
			[0.4124564, 0.3575761, 0.1804375],
			[0.2126729, 0.7151522, 0.072175],
			[0.0193339, 0.119192, 0.9503041],
		];
		for (let r = 0; r < 3; r++)
			for (let c = 0; c < 3; c++)
				expect(Math.abs(((SRGB_TO_XYZ[r] as Vec3)[c] as number) - ((PUB[r] as Vec3)[c] as number))).toBeLessThan(3e-4);
	});
	it("XYZ -> Display P3 matches the CSS Color 4 sample matrix to 1e-4", () => {
		// CSS Color 4, sample code "XYZ_to_lin_P3" (rounded): first row 2.4934969, -0.9313836, -0.4027108.
		expect(Math.abs(XYZ_TO_P3[0][0] - 2.4934969)).toBeLessThan(1e-4);
		expect(Math.abs(XYZ_TO_P3[0][1] + 0.9313836)).toBeLessThan(1e-4);
		expect(Math.abs(XYZ_TO_P3[1][1] - 1.7626641)).toBeLessThan(1e-4);
	});
});

describe("published vectors", () => {
	it("CIELAB D65 of sRGB primaries (Lindbloom calculator values, D65 white, no adaptation)", () => {
		// sRGB red #ff0000 in Lab D65: (53.24, 80.09, 67.20); white (100, 0, 0); black (0,0,0).
		expect(maxAbs(srgbToLab(hexToRgb("#ff0000")), [53.24, 80.09, 67.2])).toBeLessThan(0.02);
		expect(maxAbs(srgbToLab(hexToRgb("#ffffff")), [100, 0, 0])).toBeLessThan(1e-6);
		expect(maxAbs(srgbToLab(hexToRgb("#000000")), [0, 0, 0])).toBeLessThan(1e-9);
	});
	it("Oklab of sRGB white/red (Ottosson's post: white L=1, a=b=0; red ~ (0.628, 0.225, 0.126))", () => {
		expect(maxAbs(srgbToOklabV(hexToRgb("#ffffff")), [1, 0, 0])).toBeLessThan(1e-4);
		expect(maxAbs(srgbToOklabV(hexToRgb("#ff0000")), [0.628, 0.2249, 0.1258])).toBeLessThan(1e-3);
	});
	it("HSL/HSV/HWB of CSS named colors (CSS Color 4 examples)", () => {
		// rebeccapurple #663399 = hsl(270 50% 40%), hwb(270 20% 40%)
		expect(maxAbs(srgbToHsl(hexToRgb("#663399")), [270, 0.5, 0.4])).toBeLessThan(1e-9);
		expect(maxAbs(srgbToHwb(hexToRgb("#663399")), [270, 0.2, 0.4])).toBeLessThan(1e-9);
		expect(maxAbs(srgbToHsv(hexToRgb("#663399")), [270, 2 / 3, 0.6])).toBeLessThan(1e-9);
	});
	it("naive CMYK edge cases", () => {
		expect(srgbToCmykNaive([0, 0, 0])).toEqual([0, 0, 0, 1]);
		expect(srgbToCmykNaive([1, 1, 1])).toEqual([0, 0, 0, 0]);
		expect(srgbToCmykNaive([1, 0, 0])).toEqual([0, 1, 1, 0]);
	});
	it("BT.2020 OETF is continuous at beta and hits 1 at 1", () => {
		expect(bt2020Oetf(1)).toBeCloseTo(1, 12);
		expect(Math.abs(bt2020Oetf(0.018053968510807) - 4.5 * 0.018053968510807)).toBeLessThan(1e-6);
	});
});

describe("round trips", () => {
	it("Lab, LCH, HSV, HSL, P3, Oklch invert back to the same sRGB", () => {
		for (const hex of SAMPLES.slice(0, 300)) {
			const rgb = hexToRgb(hex);
			expect(maxAbs(labToSrgb(srgbToLab(rgb)), rgb)).toBeLessThan(1e-9);
			expect(maxAbs(lchToSrgb(srgbToLch(rgb)), rgb)).toBeLessThan(1e-9);
			expect(maxAbs(hsvToSrgb(srgbToHsv(rgb)), rgb)).toBeLessThan(1e-9);
			expect(maxAbs(hslToSrgb(srgbToHsl(rgb)), rgb)).toBeLessThan(1e-9);
			expect(maxAbs(p3ToSrgb(srgbToP3(rgb)), rgb)).toBeLessThan(1e-9);
			// The published Oklab matrices are rounded to 10 digits, so the inverse is only good to ~1e-6.
			expect(maxAbs(oklchToSrgb(srgbToOklchV(rgb)), rgb)).toBeLessThan(1e-5);
		}
	});
});

describe("cross-check against colorjs.io", () => {
	const dev: Record<string, number> = {};
	const note = (k: string, v: number) => {
		dev[k] = Math.max(dev[k] ?? 0, v);
	};
	it("computes deviations over random sRGB colors", () => {
		for (const hex of SAMPLES) {
			const rgb = hexToRgb(hex) as Rgb;
			note("xyz-d65", maxAbs(srgbToXyz(rgb), cj(hex, "xyz-d65")));
			note("srgb-linear", maxAbs(srgbToLinearRgb(rgb), cj(hex, "srgb-linear")));
			note("lab-d65", maxAbs(srgbToLab(rgb), cj(hex, "lab-d65")));
			note("lab (color.ts constants) vs ours", maxAbs(srgbToLab(rgb), colorTsLab(rgb)));
			const lch = srgbToLch(rgb);
			const theirsLab = cj(hex, "lab-d65");
			const theirsC = Math.hypot(theirsLab[1] as number, theirsLab[2] as number);
			note("lch-d65 C", Math.abs(lch[1] - theirsC));
			if (lch[1] >= 5) {
				const theirsH = (Math.atan2(theirsLab[2] as number, theirsLab[1] as number) * 180) / Math.PI;
				note("lch-d65 h (C>=5)", hueD(lch[2], theirsH));
			}
			note("p3", maxAbs(srgbToP3(rgb), cj(hex, "p3")));
			note("rec2020-linear", maxAbs(srgbToRec2020Linear(rgb), cj(hex, "rec2020-linear")));
			note("rec2020-oetf", maxAbs(srgbToRec2020(rgb), cj(hex, "--rec2020-oetf")));
			note("rec2020 (colorjs default encoding) vs our BT.2020 OETF", maxAbs(srgbToRec2020(rgb), cj(hex, "rec2020")));
			note("oklab", maxAbs(srgbToOklabV(rgb), cj(hex, "oklab")));
			const ok = srgbToOklchV(rgb);
			const theirsOk = cj(hex, "oklch");
			note("oklch L,C", maxAbs(ok.slice(0, 2), theirsOk.slice(0, 2)));
			if (ok[1] >= 0.02) note("oklch h (C>=0.02)", hueD(ok[2], theirsOk[2] as number));
			const hsl = srgbToHsl(rgb);
			const theirsHsl = cj(hex, "hsl");
			// colorjs.io reports s and l in 0..100
			note("hsl s,l (0..1)", maxAbs(hsl.slice(1), theirsHsl.slice(1).map((v) => v / 100)));
			if (hsl[1] > 0) note("hsl h", hueD(hsl[0], theirsHsl[0] as number));
			const hsv = srgbToHsv(rgb);
			const theirsHsv = cj(hex, "hsv");
			note("hsv s,v (0..1)", maxAbs(hsv.slice(1), theirsHsv.slice(1).map((v) => v / 100)));
			if (hsv[1] > 0) note("hsv h", hueD(hsv[0], theirsHsv[0] as number));
			const hwb = srgbToHwb(rgb);
			const theirsHwb = cj(hex, "hwb");
			note("hwb w,b (0..1)", maxAbs(hwb.slice(1), theirsHwb.slice(1).map((v) => v / 100)));
		}
		console.log("a-spaces max |dev| vs colorjs.io:", JSON.stringify(dev, null, 1));
		expect(dev["xyz-d65"]).toBeLessThan(2e-4);
		expect(dev["srgb-linear"]).toBeLessThan(1e-9);
		expect(dev["lab-d65"]).toBeLessThan(0.05);
		expect(dev["lch-d65 C"]).toBeLessThan(0.05);
		expect(dev["lch-d65 h (C>=5)"]).toBeLessThan(0.1);
		expect(dev.p3).toBeLessThan(2e-4);
		expect(dev["rec2020-linear"]).toBeLessThan(2e-4);
		expect(dev.oklab).toBeLessThan(2e-4);
		expect(dev["oklch L,C"]).toBeLessThan(2e-4);
		expect(dev["hsl s,l (0..1)"]).toBeLessThan(1e-6);
		expect(dev["hsv s,v (0..1)"]).toBeLessThan(1e-6);
		expect(dev["hwb w,b (0..1)"]).toBeLessThan(1e-6);
	});
});
