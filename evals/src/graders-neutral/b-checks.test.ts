import { describe, expect, it } from "vitest";
import { type BParams, gradeB, resolve, test } from "./b-checks.js";

describe("b-checks engine", () => {
	it("resolves keys, indices and by-id steps (case-insensitive id)", () => {
		const a = { results: [{ id: "A", v: 1 }, { id: "b", v: 2 }], xs: [10, 20] };
		expect(resolve(a, ["results", { by: "id", eq: "B" }, "v"])).toBe(2);
		expect(resolve(a, ["xs", 1])).toBe(20);
		expect(resolve(a, ["results", { by: "id", eq: "zz" }, "v"])).toBeUndefined();
		expect(resolve(null, ["x", 0])).toBeUndefined();
		expect(resolve("str", ["length"])).toBeUndefined();
	});

	it("matches hex keys after normalization and number keys numerically", () => {
		const a = { results: [{ id: "#C50", v: 1 }], rows: [{ at: "0.40", v: 2 }, { at: 75, v: 3 }] };
		expect(resolve(a, ["results", { by: "id", eq: "#cc5500" }, "v"])).toBe(1);
		expect(resolve(a, ["rows", { by: "at", eq: 0.4 }, "v"])).toBe(2);
		expect(resolve(a, ["rows", { by: "at", eq: 75 }, "v"])).toBe(3);
		expect(resolve(a, ["rows", { by: "at", eq: 10 }, "v"])).toBeUndefined();
		expect(test(["#ABC", "#0ea5e9"], { k: "seq", v: ["#aabbcc", "#0EA5E9"] })).toBe(true);
		expect(test("#ABC", { k: "eq", v: "#aabbcc" })).toBe(true);
	});

	it("hex tolerance is per channel, inclusive, and accepts #rgb and upper case", () => {
		expect(test("#102030", { k: "hex", v: "#132333", tol: 3 })).toBe(true);
		expect(test("#102030", { k: "hex", v: "#142030", tol: 3 })).toBe(false);
		expect(test("#FFF", { k: "hex", v: "#fefefe", tol: 1 })).toBe(true);
		expect(test("red", { k: "hex", v: "#ff0000", tol: 3 })).toBe(false);
	});

	it("names ignore case, spaces and hyphens; eq strings ignore case", () => {
		expect(test("Dark Gray", { k: "oneOf", v: ["darkgray", "darkgrey"] })).toBe(true);
		expect(test("split complementary", { k: "oneOf", v: ["split-complementary"] })).toBe(true);
		expect(test("Black", { k: "eq", v: "black" })).toBe(true);
		expect(test(true, { k: "eq", v: true })).toBe(true);
		expect(test("true", { k: "eq", v: true })).toBe(false);
	});

	it("has / seq / set", () => {
		expect(test(["A", "b"], { k: "has", v: "a", want: true })).toBe(true);
		expect(test(["A", "b"], { k: "has", v: "c", want: false })).toBe(true);
		expect(test(["a", "b"], { k: "seq", v: ["a", "b"] })).toBe(true);
		expect(test(["b", "a"], { k: "seq", v: ["a", "b"] })).toBe(false);
		expect(test(["b", "a"], { k: "set", v: ["a", "b"] })).toBe(true);
		expect(test(["a", "b", "c"], { k: "set", v: ["a", "b"] })).toBe(false);
	});

	it("coord checks read the answer's own HSL / Oklch coordinates, hue circularly", () => {
		expect(test("#ff0000", { k: "coord", space: "hsl", i: 0, v: 358, tol: 3 })).toBe(true);
		expect(test("#ff0000", { k: "coord", space: "hsl", i: 1, v: 100, tol: 0.1 })).toBe(true);
		expect(test("#ff0000", { k: "coord", space: "hsl", i: 2, v: 50, tol: 0.1 })).toBe(true);
		// Oklch of pure red: L 0.628, C 0.2577, h 29.23 (Ottosson's Oklab).
		expect(test("#ff0000", { k: "coord", space: "oklch", i: 0, v: 0.628, tol: 0.001 })).toBe(true);
		expect(test("#ff0000", { k: "coord", space: "oklch", i: 2, v: 29.2, tol: 0.1 })).toBe(true);
	});

	it("never throws on junk and fails every check", () => {
		const params: BParams = {
			checks: [
				{ name: "a", path: ["xs"], e: { k: "has", v: "x", want: true } },
				{ name: "b", path: ["h"], e: { k: "coord", space: "oklch", i: 2, v: 10, tol: 3 } },
				{ name: "c", path: ["n"], e: { k: "num", v: 1, tol: 0.1 } },
			],
		};
		for (const junk of [null, undefined, 42, "x", [], {}, [[]], { xs: [1, 2] }, { h: 7 }, { n: "1" }])
			expect(gradeB(junk, params).every((ch) => !ch.pass)).toBe(true);
		expect(gradeB({}, null as never)).toEqual([]);
	});
});
