import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../tasks/build/common.js";
import {
	bt709Gray,
	bt709Luma,
	hslS,
	oklabGray,
	oklabGrayClosedForm,
	oklabL,
	oklchC,
	wcagLuminance,
} from "./a-properties.js";

const randHex = (rnd: () => number) =>
	`#${Math.floor(rnd() * 0x1000000)
		.toString(16)
		.padStart(6, "0")}`;

describe("published vectors", () => {
	it("WCAG 2 relative luminance (WCAG 2.2 definition; white 1, black 0, #808080 ~ 0.2159)", () => {
		expect(wcagLuminance("#ffffff")).toBeCloseTo(1, 10);
		expect(wcagLuminance("#000000")).toBe(0);
		expect(wcagLuminance("#808080")).toBeCloseTo(0.2158605, 6);
		// pure primaries equal the BT.709 coefficients
		expect(wcagLuminance("#00ff00")).toBeCloseTo(0.7152, 10);
	});
	it("BT.709 luma of primaries equals the BT.709-6 coefficients", () => {
		expect(bt709Luma("#ff0000")).toBeCloseTo(0.2126, 12);
		expect(bt709Luma("#0000ff")).toBeCloseTo(0.0722, 12);
		expect(bt709Gray("#ffffff")).toBe("#ffffff");
	});
	it("Oklab gray of a gray is itself; bisection agrees with encode(L^3)", () => {
		for (const g of ["#000000", "#333333", "#808080", "#c0c0c0", "#ffffff"]) expect(oklabGray(g)).toBe(g);
		const rnd = mulberry32(3041);
		for (let i = 0; i < 500; i++) {
			const h = randHex(rnd);
			expect(oklabGray(h)).toBe(oklabGrayClosedForm(h));
		}
	});
	it("HSL saturation of rebeccapurple is 50% (CSS Color 4)", () => {
		expect(hslS("#663399")).toBeCloseTo(0.5, 12);
	});
});

describe("cross-check against colorjs.io", () => {
	it("luminance, Oklab L, Oklch C, HSL s", () => {
		const rnd = mulberry32(304);
		let lum = 0;
		let L = 0;
		let C = 0;
		let S = 0;
		for (let i = 0; i < 2000; i++) {
			const h = randHex(rnd);
			const c = new Color(h);
			lum = Math.max(lum, Math.abs(c.luminance - wcagLuminance(h)));
			L = Math.max(L, Math.abs(Number(c.to("oklab").coords[0]) - oklabL(h)));
			C = Math.max(C, Math.abs(Number(c.to("oklch").coords[1]) - oklchC(h)));
			S = Math.max(S, Math.abs((Number(c.to("hsl").coords[1]) || 0) / 100 - hslS(h)));
		}
		console.log(`a-properties max |dev| vs colorjs.io: luminance ${lum}; oklab L ${L}; oklch C ${C}; hsl s ${S}`);
		expect(lum).toBeLessThan(1e-4);
		expect(L).toBeLessThan(1e-4);
		expect(C).toBeLessThan(1e-4);
		expect(S).toBeLessThan(1e-9);
	});
});
