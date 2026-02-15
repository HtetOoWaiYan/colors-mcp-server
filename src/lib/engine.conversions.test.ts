import { describe, expect, it } from "vitest";
import { SUPPORTED_SPACES } from "../constants.js";
import { convertColor } from "./engine.js";

describe("Engine Conversions", () => {
	const sourceColor = "#ff0000"; // Red

	// Expected values for Red in different spaces (approximate)
	// We check structure mostly, but sanity check values where easy
	// biome-ignore lint/suspicious/noExplicitAny: simplifies test checks across multiple formats
	const checks: Record<string, (result: any) => void> = {
		hex: (res) => expect(res).toBe("#ff0000"),
		rgb: (res) => {
			expect(res.mode).toBe("rgb");
			expect(res.r).toBe(1);
			expect(res.g).toBe(0);
			expect(res.b).toBe(0);
		},
		hsl: (res) => {
			expect(res.mode).toBe("hsl");
			expect(res.h).toBe(0);
			expect(res.s).toBe(1);
			expect(res.l).toBe(0.5);
		},
		oklch: (res) => {
			expect(res.mode).toBe("oklch");
			expect(res.l).toBeCloseTo(0.628, 2);
			expect(res.c).toBeCloseTo(0.258, 2);
			expect(res.h).toBeCloseTo(29.23, 1);
		},
		oklab: (res) => {
			expect(res.mode).toBe("oklab");
			expect(res.l).toBeCloseTo(0.628, 2);
			expect(res.a).toBeCloseTo(0.225, 2);
			expect(res.b).toBeCloseTo(0.126, 2);
		},
		p3: (res) => {
			expect(res.mode).toBe("p3");
			// Red in sRGB is approx these in P3
			expect(res.r).toBeCloseTo(0.918, 2);
			expect(res.g).toBeCloseTo(0.2, 1); // very small
			expect(res.b).toBeCloseTo(0.14, 1); // very small
		},
		lab: (res) => {
			expect(res.mode).toBe("lab");
			expect(res.l).toBeCloseTo(54.29, 1);
			expect(res.a).toBeCloseTo(80.8, 1);
			expect(res.b).toBeCloseTo(69.89, 1);
		},
		lch: (res) => {
			expect(res.mode).toBe("lch");
			expect(res.l).toBeCloseTo(54.29, 1);
			expect(res.c).toBeCloseTo(106.8, 1);
			expect(res.h).toBeCloseTo(40.85, 1);
		},
	};

	SUPPORTED_SPACES.forEach((space) => {
		it(`should convert to ${space}`, () => {
			const result = convertColor(sourceColor, space);

			if (space in checks) {
				checks[space](result);
			} else {
				// Fallback if we add new spaces but forget to add detailed checks
				if (space === "hex") {
					expect(typeof result).toBe("string");
				} else {
					expect(typeof result).toBe("object");
					expect(result).toHaveProperty("mode", space);
				}
			}
		});
	});

	it("should handle precision correctly across formats", () => {
		// Test precision with a number that needs rounding
		// biome-ignore lint/suspicious/noExplicitAny: accessing properties dynamically for test
		const res = convertColor("#ff0000", "oklch", 1) as any;
		expect(res.l.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(1);
		expect(res.c.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(1);
	});
});
