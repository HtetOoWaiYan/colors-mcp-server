import { describe, expect, it } from "vitest";
import { SCALE_KEYS } from "../reference-neutral/c-scale.js";
import { gradeScale2, type Scale2Params } from "./v2-c-graders.js";

// A plain gray ramp from #f5f5f5 down to #1a1a1a: evenly spaced in 8-bit value, monotone in Oklch L.
const grays = ["#f5f5f5", "#e0e0e0", "#c8c8c8", "#b0b0b0", "#989898", "#808080", "#686868", "#545454", "#404040", "#2c2c2c", "#1a1a1a"];
const scale = Object.fromEntries(SCALE_KEYS.map((k, i) => [k, grays[i] as string]));

const base: Scale2Params = {
	keys: [...SCALE_KEYS],
	lightFloor: 0.9,
	darkCeiling: 0.3,
	stepRatio: [0.3, 3],
	hue: { seedHue: 0, tol: 20, minChroma: 0.02 },
};
const failing = (answer: unknown, p: Scale2Params) =>
	gradeScale2(answer, p)
		.filter((c) => !c.pass)
		.map((c) => c.name);

describe("tonal scale with several pairings", () => {
	it("runs the v1 scale checks unchanged when no pairing is stated", () => {
		expect(failing({ scale }, base)).toEqual([]);
		expect(gradeScale2({ scale }, base).map((c) => c.name)).toContain("lightness-decreasing");
	});

	it("checks each step pair and each step-vs-fixed-color pairing with its own named check", () => {
		const p: Scale2Params = {
			...base,
			pairs: [
				{ fg: "800", bg: "50", min: 7 }, // #404040 on #f5f5f5: about 9.4:1
				{ fg: "500", bg: "50", min: 4.5 }, // #808080 on #f5f5f5: about 3.6:1
			],
			against: [
				{ step: "700", color: "#ffffff", label: "white", min: 4.5 }, // #545454: about 7.5:1
				{ step: "300", color: "#fff", label: "paper", min: 3 }, // #b0b0b0: about 2.1:1
			],
		};
		expect(failing({ scale }, p)).toEqual(["contrast-500-on-50", "contrast-300-vs-paper"]);
	});

	it("fails the pairing checks, without throwing, when the scale is missing or malformed", () => {
		const p: Scale2Params = { ...base, pairs: [{ fg: "800", bg: "50", min: 7 }], against: [{ step: "700", color: "#ffffff", label: "white", min: 4.5 }] };
		for (const junk of [null, undefined, 42, "x", [], {}, { scale: [] }, { scale: { ...scale, "800": "black" } }]) {
			expect(() => gradeScale2(junk, p)).not.toThrow();
			const f = failing(junk, p);
			expect(f).toContain("contrast-800-on-50");
		}
		expect(() => gradeScale2({ scale }, null as never)).not.toThrow();
	});
});
