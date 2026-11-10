import { describe, expect, it } from "vitest";
import { gradeTable, matches } from "./a-table.js";

describe("author A table grader", () => {
	it("hue comparisons wrap around 360", () => {
		expect(matches(359.8, { k: "hue", v: 0.1, tol: 0.5 })).toBe(true);
		expect(matches([50, 10, 359.9], { k: "vec", v: [50, 10, 0.2], tol: [0.1, 0.1, 0.5], hue: [2] })).toBe(true);
		expect(matches([50, 10, 180], { k: "vec", v: [50, 10, 0.2], tol: [0.1, 0.1, 0.5], hue: [2] })).toBe(false);
	});
	it("null tolerance skips a component but it must still be present", () => {
		expect(matches([0, 0, 123], { k: "vec", v: [0, 0, 0], tol: [0.1, 0.1, null] })).toBe(true);
		expect(matches([0, 0], { k: "vec", v: [0, 0, 0], tol: [0.1, 0.1, null] })).toBe(false);
	});
	it("parses CSS color() strings", () => {
		const e = { k: "css" as const, space: "display-p3", v: [0.9, 0.4, 0.2], tol: [0.002, 0.002, 0.002] };
		expect(matches("color(display-p3 0.9010 0.4 0.2)", e)).toBe(true);
		expect(matches("COLOR( Display-P3  0.9 0.4 0.2 )", e)).toBe(true);
		expect(matches("color(srgb 0.9 0.4 0.2)", e)).toBe(false);
		expect(matches("color(display-p3 90% 40% 20%)", e)).toBe(false);
	});
	it("hex tolerance is per 8-bit channel; strings normalize", () => {
		expect(matches("#0A0B0C", { k: "hex", v: "#0b0c0d", tol: 1 })).toBe(true);
		expect(matches("#0a0b0c", { k: "hex", v: "#0d0c0d", tol: 1 })).toBe(false);
		expect(matches(" White ", { k: "eq", v: "white" })).toBe(true);
		expect(matches(["#ABC", "#ffffff"], { k: "set", v: ["#ffffff", "#aabbcc"] })).toBe(true);
		expect(matches(["#ffffff", "#ffffff"], { k: "set", v: ["#ffffff", "#aabbcc"] })).toBe(false);
	});
	it("missing rows and junk fail checks without throwing", () => {
		const params = { rows: [{ key: "a", checks: [{ name: "x-a", path: ["x"], e: { k: "num" as const, v: 1, tol: 0.1 } }] }] };
		expect(gradeTable({ results: [{ id: "A", x: 1.05 }] }, params)).toEqual([{ name: "x-a", pass: true }]);
		for (const junk of [null, 1, "s", [], { results: [null, 3, { id: {} }] }])
			expect(gradeTable(junk, params)).toEqual([{ name: "x-a", pass: false }]);
	});
});
