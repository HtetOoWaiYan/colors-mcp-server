import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { deltaE2000, hexToRgb, rgbToLab, rgbToOklab, srgbToLinear, type Vec3 } from "../reference/color.js";
import { mulberry32 } from "../tasks/build/common.js";
import {
	contrast,
	de2000Hex,
	deutan,
	deutanDE,
	deutanDERounded,
	hexOfOklch,
	hueDist,
	hueInBand,
	invert3,
	oklabOfHex,
	oklchOfHex,
	okDist,
	P3_TO_XYZ,
	p3ToSrgb,
	reduceChroma,
	rgbToHex,
	SRGB_TO_XYZ,
} from "./c-color.js";

const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0x1000000)
		.toString(16)
		.padStart(6, "0")}`;
const coords = (c: { coords: unknown }) => (c.coords as (number | null)[]).map((v) => Number(v ?? 0)) as [number, number, number];

describe("published vectors", () => {
	it("WCAG 2 contrast: black/white 21:1 and the classic #767676 / #777777 boundary pair", () => {
		// WCAG 2.x definition of contrast ratio; #767676 is the well-known lightest gray passing 4.5:1 on white.
		expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 10);
		expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
		expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
		expect(contrast("#ffffff", "#ffffff")).toBe(1);
	});

	it("sRGB RGB->XYZ derived from chromaticities matches IEC 61966-2-1 (4 decimals)", () => {
		const iec = [
			[0.4124, 0.3576, 0.1805],
			[0.2126, 0.7152, 0.0722],
			[0.0193, 0.1192, 0.9505],
		];
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(SRGB_TO_XYZ[i]?.[j]).toBeCloseTo(iec[i]?.[j] as number, 4);
	});

	it("Display P3 RGB->XYZ matches the CSS Color 4 sample-code matrix (6 decimals)", () => {
		// CSS Color 4, section "Sample code for color conversions", lin_P3_to_XYZ.
		const css = [
			[0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
			[0.2289745640697488, 0.6917385218365064, 0.079286914093745],
			[0, 0.04511338185890264, 1.043944368900976],
		];
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(P3_TO_XYZ[i]?.[j]).toBeCloseTo(css[i]?.[j] as number, 6);
	});

	it("P3 white is sRGB white, and sRGB red is about color(display-p3 0.9175 0.2003 0.1386)", () => {
		const w = p3ToSrgb([1, 1, 1]);
		for (const v of w) expect(v).toBeCloseTo(1, 9);
		const red = p3ToSrgb([0.9175, 0.2003, 0.1386]);
		expect(red[0]).toBeCloseTo(1, 3);
		expect(Math.abs(red[1])).toBeLessThan(0.003);
		expect(Math.abs(red[2])).toBeLessThan(0.003);
	});

	it("Oklab matches Ottosson's published XYZ test table (3 decimals)", () => {
		// Ottosson, "A perceptual color space for image processing" (2020), table of XYZ -> Oklab values.
		const table: [Vec3, Vec3][] = [
			[[0.95, 1, 1.089], [1, 0, 0]],
			[[1, 0, 0], [0.45, 1.236, -0.019]],
			[[0, 1, 0], [0.922, -0.671, 0.263]],
			[[0, 0, 1], [0.153, -1.415, -0.449]],
		];
		const xyzToLinSrgb = invert3(SRGB_TO_XYZ);
		for (const [xyz, lab] of table) {
			const lin = xyzToLinSrgb.map((r) => r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2]) as unknown as Vec3;
			// feed linear values through the encoded-sRGB entry point by encoding exactly
			const enc = lin.map((v) => {
				const a = Math.abs(v);
				return a <= 0.0031308 ? 12.92 * v : Math.sign(v) * (1.055 * a ** (1 / 2.4) - 0.055);
			}) as unknown as Vec3;
			const got = rgbToOklab(enc);
			for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(lab[i] as number, 2);
		}
	});

	it("CIEDE2000 matches Sharma, Wu & Dalal (2005) Table 1 pairs 1, 7, 17, 25, 34", () => {
		const SHARMA: [Vec3, Vec3, number][] = [
			[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
			[[50, 0, 0], [50, -1, 2], 2.3669],
			[[50, 2.5, 0], [73, 25, -18], 27.1492],
			[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
			[[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
		];
		for (const [a, b, e] of SHARMA) {
			expect(deltaE2000(a, b)).toBeCloseTo(e, 4);
			expect(deltaE2000(b, a)).toBeCloseTo(e, 4);
		}
	});

	it("Machado 2009 deuteranopia severity 1.0: linear primaries map to the published matrix columns", () => {
		// Machado, Oliveira & Fernandes (2009), supplementary severity table, deuteranomaly 1.0.
		const M = [
			[0.367322, 0.860646, -0.227968],
			[0.280085, 0.672501, 0.047413],
			[-0.01182, 0.04294, 0.968881],
		];
		const enc = (v: number) => {
			const c = Math.min(1, Math.max(0, v));
			return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
		};
		["#ff0000", "#00ff00", "#0000ff"].forEach((h, j) => {
			const s = deutan(h);
			for (let i = 0; i < 3; i++) expect(s[i]).toBeCloseTo(enc(M[i]?.[j] as number), 9);
		});
		for (const g of ["#ffffff", "#808080", "#000000"]) expect(rgbToHex(deutan(g))).toBe(g);
	});

	it("hue helpers", () => {
		expect(hueDist(350, 10)).toBe(20);
		expect(hueDist(10, 350)).toBe(20);
		expect(hueDist(0, 180)).toBe(180);
		expect(hueInBand(5, 350, 20)).toBe(true);
		expect(hueInBand(345, 350, 20)).toBe(false);
		expect(hueInBand(30, 20, 40)).toBe(true);
	});
});


describe("cross-check against colorjs.io", () => {
	const rnd = mulberry32(309312);
	const sample = Array.from({ length: 1500 }, () => randHex(rnd));

	it("Oklab, D65 Lab, CIEDE2000, WCAG contrast", () => {
		let okDev = 0;
		let labDev = 0;
		let deDev = 0;
		let crDev = 0;
		for (let i = 0; i < sample.length; i++) {
			const a = sample[i] as string;
			const b = sample[(i * 7 + 3) % sample.length] as string;
			const ca = new Color(a);
			okDev = Math.max(okDev, okDist(coords(ca.to("oklab")), oklabOfHex(a)));
			const lab = coords(ca.to("lab-d65"));
			const mine = rgbToLab(hexToRgb(a));
			labDev = Math.max(labDev, Math.abs(lab[0] - mine[0]), Math.abs(lab[1] - mine[1]), Math.abs(lab[2] - mine[2]));
			// colorjs's "2000" reads its D50 lab; feed it D65 coordinates to compare the formula itself.
			const theirs = new Color("lab", lab).deltaE(new Color("lab", coords(new Color(b).to("lab-d65"))), "2000");
			deDev = Math.max(deDev, Math.abs(theirs - de2000Hex(a, b)));
			crDev = Math.max(crDev, Math.abs(Color.contrast(a, b, "WCAG21") - contrast(a, b)));
		}
		console.log(`c-color colorjs max deviations: oklab ${okDev.toExponential(2)}, lab-d65 ${labDev.toExponential(2)}, de2000 ${deDev.toExponential(2)}, wcag ${crDev.toExponential(2)}`);
		expect(okDev).toBeLessThan(1e-4);
		expect(labDev).toBeLessThan(0.02);
		expect(deDev).toBeLessThan(0.01);
		expect(crDev).toBeLessThan(1e-3);
	});

	it("Display P3 -> sRGB conversion", () => {
		let dev = 0;
		for (let i = 0; i < 500; i++) {
			const p: Vec3 = [rnd(), rnd(), rnd()];
			const theirs = coords(new Color("p3", [...p] as [number, number, number]).to("srgb"));
			const mine = p3ToSrgb(p);
			for (let k = 0; k < 3; k++) dev = Math.max(dev, Math.abs((theirs[k] as number) - (mine[k] as number)));
		}
		console.log(`c-color colorjs P3->sRGB max deviation ${dev.toExponential(2)}`);
		expect(dev).toBeLessThan(1e-5);
	});

	it("chroma reduction lands on the sRGB boundary as colorjs.io sees it (in gamut at C', out at C' + 0.001)", () => {
		// colorjs's own "oklch.c" toGamut method is not a pure bisection (it also clips within a JND), so the
		// boundary itself is what we cross-check: colorjs's conversion must agree that C' is the largest in-gamut chroma.
		let cssWorst = 0;
		for (let i = 0; i < 400; i++) {
			const L = 0.2 + 0.75 * rnd();
			const C = 0.1 + 0.3 * rnd();
			const H = 360 * rnd();
			const m = reduceChroma({ L, C, H }).oklch;
			expect(new Color("oklch", [m.L, m.C, m.H]).inGamut("srgb", { epsilon: 1e-6 })).toBe(true);
			if (m.C < C - 1e-6) expect(new Color("oklch", [m.L, m.C + 0.001, m.H]).inGamut("srgb")).toBe(false);
			const css = rgbToHex(coords(new Color("oklch", [L, C, H]).toGamut({ space: "srgb", method: "css" }).to("srgb")));
			cssWorst = Math.max(cssWorst, okDist(oklabOfHex(css), oklabOfHex(rgbToHex(reduceChroma({ L, C, H }).rgb))));
		}
		// Informational: near the yellow/green cusps the CSS 4 JND algorithm can land far from constant-L
		// chroma reduction, which is why 311's gamut tasks pick inputs away from cusps (checked per task).
		console.log(`c-color gamut map: worst CSS-4-JND vs chroma-reduction over random inputs ${cssWorst.toFixed(4)} (Oklab)`);
	});

	it("deuteranopia CIEDE2000, rounded and unrounded simulation, agree within 1.0 (variant spread)", () => {
		let dev = 0;
		for (let i = 0; i < 400; i++) {
			const a = sample[i] as string;
			const b = sample[i + 1] as string;
			dev = Math.max(dev, Math.abs(deutanDE(a, b) - deutanDERounded(a, b)));
		}
		console.log(`c-color deutan dE00 rounded-vs-unrounded simulation spread ${dev.toFixed(3)}`);
		expect(dev).toBeLessThan(1.0);
	});

	it("Oklch helpers round-trip and hexOfOklch lands in gamut", () => {
		for (const h of sample.slice(0, 200)) {
			const c = oklchOfHex(h);
			expect(hexOfOklch(c.L, c.C, c.H)).toBe(h);
		}
		expect(srgbToLinear(1)).toBe(1);
	});
});
