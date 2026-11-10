import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { deltaE2000, hexToRgb, rgbToLab as colorTsLab, type Vec3 } from "../reference/color.js";
import { mulberry32 } from "../tasks/build/common.js";
import { de00Hex, de76Hex, deltaE76, deltaE94GraphicArts, labOfHex } from "./a-deltae.js";

const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0x1000000)
		.toString(16)
		.padStart(6, "0")}`;

describe("CIEDE2000 published vectors", () => {
	// Sharma, Wu, Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes,
	// supplementary test data", Table 1, pairs 1, 7, 17, 25, 34.
	const SHARMA: [Vec3, Vec3, number][] = [
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 0, 0], [50, -1, 2], 2.3669],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
		[[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
	];
	it.each(SHARMA)("%j vs %j = %f", (a, b, e) => {
		expect(deltaE2000(a, b)).toBeCloseTo(e, 4);
		expect(deltaE2000(b, a)).toBeCloseTo(e, 4);
	});
});

describe("CIE94 graphic arts (CIE 116-1995) identities", () => {
	it("pure lightness difference equals |dL| (SL = 1)", () => {
		expect(deltaE94GraphicArts([50, 20, 10], [57, 20, 10])).toBeCloseTo(7, 12);
	});
	it("pure chroma difference is dC / (1 + 0.045 C1), with C1 from the reference color", () => {
		// ref chroma 30 (a=30), sample chroma 40 on the same hue
		expect(deltaE94GraphicArts([50, 30, 0], [50, 40, 0])).toBeCloseTo(10 / (1 + 0.045 * 30), 12);
		expect(deltaE94GraphicArts([50, 40, 0], [50, 30, 0])).toBeCloseTo(10 / (1 + 0.045 * 40), 12);
	});
	it("pure hue difference at equal chroma is dH / (1 + 0.015 C1)", () => {
		const C = 30;
		const t = (20 * Math.PI) / 180;
		const sample: Vec3 = [50, C * Math.cos(t), C * Math.sin(t)];
		const dH = 2 * C * Math.sin(t / 2);
		expect(deltaE94GraphicArts([50, C, 0], sample)).toBeCloseTo(dH / (1 + 0.015 * C), 10);
	});
	it("CIE76 is the Euclidean distance", () => {
		expect(deltaE76([0, 0, 0], [3, 4, 12])).toBe(13);
	});
});

describe("cross-check against colorjs.io", () => {
	it("D65 Lab, CIE76 and CIEDE2000 on random pairs", () => {
		const rnd = mulberry32(302);
		let labDev = 0;
		let de76Dev = 0;
		let de00FormulaDev = 0;
		let de00D50vsD65 = 0;
		let constantsDev = 0;
		for (let i = 0; i < 1500; i++) {
			const a = randHex(rnd);
			const b = randHex(rnd);
			const ca = new Color(a).to("lab-d65").coords.map(Number) as unknown as Vec3;
			const cb = new Color(b).to("lab-d65").coords.map(Number) as unknown as Vec3;
			const la = labOfHex(a);
			labDev = Math.max(labDev, ...la.map((v, k) => Math.abs(v - (ca[k] as number))));
			// colorjs.io's deltaE76 / deltaE2000 work in its D50 "lab" space, so compare the formula on D50
			// coordinates, and our D65 pipeline separately.
			const d50a = new Color(a).to("lab").coords.map(Number) as unknown as Vec3;
			const d50b = new Color(b).to("lab").coords.map(Number) as unknown as Vec3;
			const theirs00 = new Color(a).deltaE(new Color(b), "2000");
			de00FormulaDev = Math.max(de00FormulaDev, Math.abs(deltaE2000(d50a, d50b) - theirs00));
			const theirs76 = new Color(a).deltaE(new Color(b), "76");
			de76Dev = Math.max(de76Dev, Math.abs(deltaE76(d50a, d50b) - theirs76));
			de00D50vsD65 = Math.max(de00D50vsD65, Math.abs(de00Hex(a, b) - theirs00));
			constantsDev = Math.max(
				constantsDev,
				Math.abs(
					de00Hex(a, b) - deltaE2000(colorTsLab(hexToRgb(a)), colorTsLab(hexToRgb(b))),
				),
				Math.abs(de76Hex(a, b) - deltaE76(colorTsLab(hexToRgb(a)), colorTsLab(hexToRgb(b)))),
			);
		}
		console.log(
			`a-deltae max |dev| vs colorjs.io: lab-d65 ${labDev}; dE76 formula (D50 coords) ${de76Dev}; dE00 formula (D50 coords) ${de00FormulaDev}; our D65 dE00 vs colorjs D50 dE00 ${de00D50vsD65}; white-point constants (0.95047/1.08883 vs xy-derived) ${constantsDev}`,
		);
		expect(labDev).toBeLessThan(1e-6);
		expect(de76Dev).toBeLessThan(1e-6);
		expect(de00FormulaDev).toBeLessThan(1e-6);
		expect(constantsDev).toBeLessThan(0.02);
	});
});
