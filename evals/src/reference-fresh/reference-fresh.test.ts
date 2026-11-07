import { describe, expect, it } from "vitest";
import { hexToRgb, relativeLuminance } from "../reference/color.js";
import { encode709Limited, encodeJfif } from "../reference-gen/ycbcr.js";
import {
	blendAt,
	gradientLuminanceRange,
	gradientMinContrast,
	segmentMinLuminance,
	stopsMinContrast,
} from "./gradient.js";
import { BT601, BT709, BT2020, decodeYcbcr, encodeYcbcr } from "./ycbcr.js";

const near = (got: readonly number[], want: readonly number[], digits = 3) =>
	got.forEach((v, k) => expect(v).toBeCloseTo(want[k] as number, digits));

describe("generic Y'CbCr known vectors", () => {
	it("BT.601 8-bit limited: white, black and red (Y' = 16 + 219 x 0.299, Cr at its 240 ceiling)", () => {
		const s = { ...BT601, bits: 8, range: "limited" } as const;
		near(encodeYcbcr("#ffffff", s), [235, 128, 128]);
		near(encodeYcbcr("#000000", s), [16, 128, 128]);
		near(encodeYcbcr("#ff0000", s), [81.481, 128 - (224 * 0.299) / 1.772, 240]);
	});
	it("BT.2020 10-bit limited: white 940, black 64, chroma zero 512, blue Cb at its 960 ceiling", () => {
		const s = { ...BT2020, bits: 10, range: "limited" } as const;
		near(encodeYcbcr("#ffffff", s), [940, 512, 512]);
		near(encodeYcbcr("#000000", s), [64, 512, 512]);
		expect(encodeYcbcr("#0000ff", s)[1]).toBeCloseTo(960, 6);
	});
	it("agrees with the independent generalization-suite encoders for JFIF and BT.709 8-bit", () => {
		for (const hex of ["#3a7bd5", "#e11d48", "#a3e635", "#123456"]) {
			near(encodeYcbcr(hex, { ...BT601, bits: 8, range: "full" }), encodeJfif(hex), 2);
			near(encodeYcbcr(hex, { ...BT709, bits: 8, range: "limited" }), encode709Limited(hex), 6);
		}
	});
	it("decode inverts encode in every range", () => {
		for (const s of [
			{ ...BT601, bits: 8, range: "full" },
			{ ...BT709, bits: 10, range: "limited" },
			{ ...BT2020, bits: 10, range: "limited" },
		] as const) {
			const [y, cb, cr] = encodeYcbcr("#3a7bd5", s);
			near(decodeYcbcr(y, cb, cr, s).map((v) => v * 255), [0x3a, 0x7b, 0xd5], 6);
		}
	});
});

describe("text over a gradient", () => {
	it("blends encoded channel values linearly", () => {
		near(blendAt("#ff0000", "#00ff00", 0.5), [0.5, 0.5, 0], 9);
	});
	it("finds the dip between red and green stops, matching a dense brute-force scan", () => {
		let brute = Number.POSITIVE_INFINITY;
		for (let i = 0; i <= 20000; i++)
			brute = Math.min(brute, relativeLuminance(blendAt("#ff0000", "#00ff00", i / 20000)));
		const found = segmentMinLuminance("#ff0000", "#00ff00");
		expect(found).toBeCloseTo(brute, 7);
		// both stops are brighter than the dip: red is 0.2126 alone
		expect(found).toBeLessThan(0.2126 - 0.02);
	});
	it("the range maximum is the brightest stop and the minimum covers every segment", () => {
		const r = gradientLuminanceRange(["#000000", "#ffffff", "#808080"]);
		expect(r.min).toBe(0);
		expect(r.max).toBeCloseTo(1, 12);
	});
	it("text inside the gradient's luminance range scores 1; outside it scores against the nearest extreme", () => {
		expect(gradientMinContrast("#777777", ["#000000", "#ffffff"])).toBe(1);
		// #767676 on white is the textbook 4.54:1
		expect(gradientMinContrast("#767676", ["#ffffff", "#ffffff"])).toBeCloseTo(4.54, 2);
	});
	it("checking only the stops overstates contrast when the gradient dips", () => {
		const stops = ["#ff0000", "#00ff00"];
		const yRed = relativeLuminance(hexToRgb("#ff0000"));
		const black = "#000000";
		expect(stopsMinContrast(black, stops)).toBeCloseTo((yRed + 0.05) / 0.05, 9);
		expect(gradientMinContrast(black, stops)).toBeLessThan(stopsMinContrast(black, stops) - 0.3);
	});
});
