import { describe, expect, it } from "vitest";
import { ColorSchema, PrecisionSchema } from "./common.js";

describe("ColorSchema", () => {
	it("should accept valid hex colors", () => {
		expect(ColorSchema.parse("#ff0000")).toBe("#ff0000");
		expect(ColorSchema.parse("000")).toBe("000"); // Culori accepts '000' as hex
	});

	it("should accept valid named colors", () => {
		expect(ColorSchema.parse("red")).toBe("red");
		expect(ColorSchema.parse("steelblue")).toBe("steelblue");
	});

	it("should accept valid oklch colors", () => {
		expect(ColorSchema.parse("oklch(0.5 0.1 20)")).toBe("oklch(0.5 0.1 20)");
	});

	it("should reject invalid color strings", () => {
		expect(() => ColorSchema.parse("not-a-color")).toThrow();
		expect(() => ColorSchema.parse("")).toThrow();
	});
});

describe("PrecisionSchema", () => {
	it("should accept valid precision (0-10)", () => {
		expect(PrecisionSchema.parse(0)).toBe(0);
		expect(PrecisionSchema.parse(5)).toBe(5);
		expect(PrecisionSchema.parse(10)).toBe(10);
	});

	it("should use default precision of 3", () => {
		expect(PrecisionSchema.parse(undefined)).toBe(3);
	});

	it("should reject invalid precision", () => {
		expect(() => PrecisionSchema.parse(-1)).toThrow();
		expect(() => PrecisionSchema.parse(11)).toThrow();
		expect(() => PrecisionSchema.parse(1.5)).toThrow();
	});
});
