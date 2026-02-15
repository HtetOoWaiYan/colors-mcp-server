import { describe, expect, it } from "vitest";
import {
	AdjustInputSchema,
	DifferenceInputSchema,
	MixInputSchema,
	ScaleInputSchema,
} from "./manipulation.js";

describe("Manipulation Schemas", () => {
	describe("AdjustInputSchema", () => {
		it("should accept valid input", () => {
			const result = AdjustInputSchema.safeParse({
				color: "red",
				mode: "lightness",
				amount: 0.1,
			});
			expect(result.success).toBe(true);
		});

		it("should reject invalid mode", () => {
			const result = AdjustInputSchema.safeParse({
				color: "red",
				mode: "invalid",
				amount: 0.1,
			});
			expect(result.success).toBe(false);
		});
	});

	describe("MixInputSchema", () => {
		it("should accept valid input", () => {
			const result = MixInputSchema.safeParse({
				color1: "red",
				color2: "blue",
			});
			expect(result.success).toBe(true);
		});

		it("should validate ratio range", () => {
			const result = MixInputSchema.safeParse({
				color1: "red",
				color2: "blue",
				ratio: 1.5,
			});
			expect(result.success).toBe(false);
		});

		it("should reject invalid colors", () => {
			const result = MixInputSchema.safeParse({
				color1: "not-a-color",
				color2: "blue",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("ScaleInputSchema", () => {
		it("should require at least 2 colors", () => {
			const result = ScaleInputSchema.safeParse({
				colors: ["red"],
			});
			expect(result.success).toBe(false);
		});

		it("should validate max steps", () => {
			const result = ScaleInputSchema.safeParse({
				colors: ["red", "blue"],
				steps: 25, // MAX is 20
			});
			expect(result.success).toBe(false);
		});

		it("should validate min steps", () => {
			const result = ScaleInputSchema.safeParse({
				colors: ["red", "blue"],
				steps: 1,
			});
			expect(result.success).toBe(false);
		});
	});

	describe("DifferenceInputSchema", () => {
		it("should default to deltaE", () => {
			const result = DifferenceInputSchema.parse({
				color1: "red",
				color2: "blue",
			});
			expect(result.metric).toBe("deltaE");
		});

		it("should accept contrast", () => {
			const result = DifferenceInputSchema.parse({
				color1: "red",
				color2: "blue",
				metric: "contrast",
			});
			expect(result.metric).toBe("contrast");
		});

		it("should reject invalid metric", () => {
			const result = DifferenceInputSchema.safeParse({
				color1: "red",
				color2: "blue",
				metric: "invalid",
			});
			expect(result.success).toBe(false);
		});
	});
});
