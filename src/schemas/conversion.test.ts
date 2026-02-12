import { describe, expect, it } from "vitest";
import { BatchConvertInputSchema, ConvertInputSchema } from "./conversion.js";

describe("ConvertInputSchema", () => {
	it("should accept valid conversion input", () => {
		const input = { color: "#ff0000", to: "oklch" };
		const result = ConvertInputSchema.parse(input);
		expect(result.color).toBe("#ff0000");
		expect(result.to).toBe("oklch");
		expect(result.precision).toBe(3); // default
	});

	it("should accept custom precision", () => {
		const input = { color: "red", to: "rgb", precision: 5 };
		const result = ConvertInputSchema.parse(input);
		expect(result.precision).toBe(5);
	});

	it("should reject invalid color spaces", () => {
		const input = { color: "#ff0000", to: "invalid-space" };
		expect(() => ConvertInputSchema.parse(input)).toThrow();
	});
});

describe("BatchConvertInputSchema", () => {
	it("should accept valid batch conversion input", () => {
		const input = { colors: ["#ff0000", "blue"], to: "hsl" };
		const result = BatchConvertInputSchema.parse(input);
		expect(result.colors).toHaveLength(2);
		expect(result.to).toBe("hsl");
	});

	it("should reject if too many colors", () => {
		const colors = Array(51).fill("#ff0000");
		const input = { colors, to: "rgb" };
		expect(() => BatchConvertInputSchema.parse(input)).toThrow();
	});

	it("should reject empty colors array", () => {
		const input = { colors: [], to: "rgb" };
		expect(() => BatchConvertInputSchema.parse(input)).toThrow();
	});
});
