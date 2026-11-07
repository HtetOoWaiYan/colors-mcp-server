import { describe, expect, it } from "vitest";
import {
	channelMatches,
	hexToRgb8,
	minScrimOpacity,
	mixLinear8,
	mixOklab8,
	mixSrgb8,
	over8,
	scrimContrast,
} from "./composite.js";
import { inHueBand } from "./hue.js";
import { decode709Limited, encode709Limited, encodeJfif } from "./ycbcr.js";

const near = (got: readonly number[], want: number[], tol = 0.01) =>
	got.forEach((v, k) => expect(v).toBeCloseTo(want[k] as number, -Math.log10(tol)));

describe("Y'CbCr known vectors", () => {
	it("BT.709 limited range: white, black and red", () => {
		near(encode709Limited("#ffffff"), [235, 128, 128]);
		near(encode709Limited("#000000"), [16, 128, 128]);
		// red: Y' = 16 + 219 x 0.2126, Cr at its 240 ceiling
		near(encode709Limited("#ff0000"), [62.5594, 102.335, 240]);
	});
	it("BT.709 decode inverts encode", () => {
		near(decode709Limited(235, 128, 128), [1, 1, 1], 1e-9);
		const [y, cb, cr] = encode709Limited("#3a7bd5");
		near(
			decode709Limited(y, cb, cr).map((v) => v * 255),
			[0x3a, 0x7b, 0xd5],
			1e-6,
		);
	});
	it("JFIF full range: white and red", () => {
		near(encodeJfif("#ffffff"), [255, 128, 128]);
		near(encodeJfif("#ff0000"), [76.245, 84.9723, 255.5]);
	});
});

describe("compositing and mixing", () => {
	it("source-over endpoints and midpoint", () => {
		const black = hexToRgb8("#000000");
		const white = hexToRgb8("#ffffff");
		expect(over8(black, 0, white)).toEqual([255, 255, 255]);
		expect(over8(black, 1, white)).toEqual([0, 0, 0]);
		expect(over8(black, 0.5, white)).toEqual([127.5, 127.5, 127.5]);
	});
	it("color-mix spaces: srgb is arithmetic, srgb-linear of black and white is #bcbcbc", () => {
		near(mixSrgb8(hexToRgb8("#ff0000"), hexToRgb8("#0000ff"), 0.5), [127.5, 0, 127.5]);
		near(mixLinear8(hexToRgb8("#000000"), hexToRgb8("#ffffff"), 0.5), [187.516, 187.516, 187.516]);
		// Ottosson's published matrices are rounded, so the Oklab round trip is exact only to about 1e-5
		near(mixOklab8(hexToRgb8("#3a7bd5"), hexToRgb8("#ffffff"), 0), [0x3a, 0x7b, 0xd5], 1e-3);
	});
	it("rounding tolerance accepts both neighbours only near a .5 tie", () => {
		expect(channelMatches(127, 127.5)).toBe(true);
		expect(channelMatches(128, 127.5)).toBe(true);
		expect(channelMatches(122, 122.0196)).toBe(true);
		expect(channelMatches(123, 122.0196)).toBe(false);
		expect(channelMatches(122.5, 122.5)).toBe(false);
		expect(channelMatches("122", 122)).toBe(false);
	});
});

describe("scrim", () => {
	it("at opacity 0 the contrast is the bare region's (#767676 on white is 4.54)", () => {
		expect(scrimContrast("#ffffff", "#000000", 0, "#767676")).toBeCloseTo(4.54, 2);
	});
	it("white text on a white region needs the composite to reach #767676 (118), not #777777", () => {
		// 255 x (1 - a) must round to 118 or below: a > 0.5353, so 0.54 on a 0.01 grid
		expect(minScrimOpacity("#ffffff", "#000000", ["#ffffff"], 4.5, 0.01)).toBe(0.54);
		expect(minScrimOpacity("#ffffff", "#000000", ["#ffffff"], 4.5, 0.05)).toBe(0.55);
		expect(minScrimOpacity("#ffffff", "#ffffff", ["#ffffff"], 4.5, 0.05)).toBeNull();
	});
});

describe("hue bands", () => {
	it("plain and wrapping arcs", () => {
		expect(inHueBand(150, 140, 165)).toBe(true);
		expect(inHueBand(139.9, 140, 165)).toBe(false);
		for (const h of [340, 359, 0, 20]) expect(inHueBand(h, 340, 20), `${h}`).toBe(true);
		for (const h of [21, 180, 339]) expect(inHueBand(h, 340, 20), `${h}`).toBe(false);
	});
});
