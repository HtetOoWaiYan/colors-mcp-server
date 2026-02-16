import { describe, expect, it } from "vitest";
import {
	BatchContrastInputSchema,
	ContrastInputSchema,
} from "./accessibility.js";

describe("ContrastInputSchema", () => {
	it("validates valid input", () => {
		const input = {
			foreground: "#000000",
			background: "#ffffff",
		};
		const result = ContrastInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it("validates input with optional base", () => {
		const input = {
			foreground: "#000000",
			background: "rgba(255, 255, 255, 0.5)",
			base: "#ffffff",
		};
		const result = ContrastInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it("fails on invalid color", () => {
		const input = {
			foreground: "invalid-color",
			background: "#ffffff",
		};
		const result = ContrastInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("fails on missing required fields", () => {
		const input = {
			foreground: "#000000",
		};
		const result = ContrastInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});

describe("BatchContrastInputSchema", () => {
	it("validates checks array", () => {
		const input = {
			checks: [
				{ foreground: "#000000", background: "#ffffff" },
				{ foreground: "#ff0000", background: "#000000" },
			],
		};
		const result = BatchContrastInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it("validates direct foregrounds and backgrounds arrays", () => {
		const input = {
			foregrounds: ["#000000", "#ffffff"],
			backgrounds: ["#ff0000", "#00ff00"],
		};
		const result = BatchContrastInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it("validates with base color", () => {
		const input = {
			base: "#000000",
			foregrounds: ["#000000", "#ffffff"],
			backgrounds: ["#ff0000", "#00ff00"],
		};
		const result = BatchContrastInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it("fails when both checks and cross-product arrays are missing", () => {
		const input = {};
		const result = BatchContrastInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("fails when only foregrounds is provided without backgrounds", () => {
		const input = {
			foregrounds: ["#000000"],
		};
		const result = BatchContrastInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it("fails when checks array is empty", () => {
		const input = {
			checks: [],
		};
		const result = BatchContrastInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});
