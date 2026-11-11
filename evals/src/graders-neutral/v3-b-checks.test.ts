import { describe, expect, it } from "vitest";
import { type CheckSpec3, gradeB3, keywordValue } from "./v3-b-checks.js";

// darkgray and darkgrey share #a9a9a9; silver is #c0c0c0 (CSS Color 4 named-color table).
const checks: CheckSpec3[] = [
	{ name: "has-darkgray", path: ["names"], e: { k: "kwHas", value: "#a9a9a9" } },
	{ name: "has-silver", path: ["names"], e: { k: "kwHas", value: "#c0c0c0" } },
	{ name: "only-expected", path: ["names"], e: { k: "kwOnly", values: ["#a9a9a9", "#c0c0c0"] } },
	{ name: "v1-eq", path: ["closest"], e: { k: "eq", v: "silver" } },
	{ name: "v2-pair", path: ["pairs"], e: { k: "pair", v: ["a", "b"], want: true } },
];
const failing = (answer: unknown) =>
	gradeB3(answer, { checks })
		.filter((c) => !c.pass)
		.map((c) => c.name);

describe("v3 keyword-set checks", () => {
	it("knows keyword values regardless of case, spaces and hyphens", () => {
		expect(keywordValue("Dark Grey")).toBe("#a9a9a9");
		expect(keywordValue("dark-gray")).toBe("#a9a9a9");
		expect(keywordValue("REBECCAPURPLE")).toBe("#663399");
		expect(keywordValue("bluish")).toBeUndefined();
	});

	it("accepts any alias of an expected value, in any order", () => {
		const ok = { closest: "Silver", pairs: [["b", "a"]] };
		expect(failing({ ...ok, names: ["silver", "darkgrey"] })).toEqual([]);
		expect(failing({ ...ok, names: ["DarkGray", "silver"] })).toEqual([]);
		expect(failing({ ...ok, names: ["darkgray", "darkgrey", "silver"] })).toEqual([]);
	});

	it("fails a missing value, an extra keyword and an unknown word", () => {
		const ok = { closest: "silver", pairs: [["a", "b"]] };
		expect(failing({ ...ok, names: ["silver"] })).toEqual(["has-darkgray"]);
		expect(failing({ ...ok, names: ["silver", "darkgray", "gray"] })).toEqual(["only-expected"]);
		expect(failing({ ...ok, names: ["silver", "darkgray", "greyish"] })).toEqual(["only-expected"]);
	});

	it("still runs v1 and v2 expectations", () => {
		expect(failing({ names: ["silver", "darkgray"], closest: "gray", pairs: [] })).toEqual(["v1-eq", "v2-pair"]);
	});

	it("fails keyword checks, without throwing, on malformed input", () => {
		for (const names of [null, "silver", [1, 2], [["silver"]], { 0: "silver" }])
			expect(failing({ names, closest: "silver", pairs: [["a", "b"]] })).toEqual(["has-darkgray", "has-silver", "only-expected"]);
		for (const junk of [null, undefined, 42, "x", [], {}, [[]]]) expect(() => gradeB3(junk, { checks })).not.toThrow();
		expect(gradeB3({}, null as never)).toEqual([]);
	});
});
