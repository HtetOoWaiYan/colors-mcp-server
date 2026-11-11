import { describe, expect, it } from "vitest";
import { type CheckSpec2, gradeB2 } from "./v2-b-checks.js";

const checks: CheckSpec2[] = [
	{ name: "has-blue-purple", path: ["pairs"], e: { k: "pair", v: ["blue", "purple"], want: true } },
	{ name: "lacks-red-green", path: ["pairs"], e: { k: "pair", v: ["red", "green"], want: false } },
	{ name: "v1-hex", path: ["hex"], e: { k: "hex", v: "#336699", tol: 2 } },
];
const failing = (answer: unknown) =>
	gradeB2(answer, { checks })
		.filter((c) => !c.pass)
		.map((c) => c.name);

describe("v2 pair checks", () => {
	it("accepts a pair in either order and case, among other pairs", () => {
		expect(failing({ pairs: [["Purple", "blue"], ["red", "brown"]], hex: "#346598" })).toEqual([]);
		expect(failing({ pairs: [["blue", "purple"]], hex: "#336699" })).toEqual([]);
	});

	it("fails a missing wanted pair and a present unwanted pair", () => {
		expect(failing({ pairs: [["green", "red"]], hex: "#336699" })).toEqual(["has-blue-purple", "lacks-red-green"]);
		expect(failing({ pairs: [], hex: "#336699" })).toEqual(["has-blue-purple"]);
	});

	it("still runs v1 expectations", () => {
		expect(failing({ pairs: [["blue", "purple"]], hex: "#3a6699" })).toEqual(["v1-hex"]);
	});

	it("fails every pair check, without throwing, on malformed lists", () => {
		for (const pairs of [null, "blue,purple", [["blue"]], [["blue", "purple", "red"]], [[1, 2]], [{ a: "blue" }], { 0: ["blue", "purple"] }])
			expect(failing({ pairs, hex: "#336699" })).toEqual(["has-blue-purple", "lacks-red-green"]);
		for (const junk of [null, undefined, 42, "x", [], {}, [[]]]) expect(() => gradeB2(junk, { checks })).not.toThrow();
		expect(gradeB2({}, null as never)).toEqual([]);
	});
});
