import { describe, expect, it } from "vitest";
import { extractAnswer } from "./extract.js";

const schema = {
	type: "object",
	required: ["hex"],
	properties: { hex: { type: "string" } },
};

describe("extractAnswer", () => {
	it("accepts a single fenced block (any tag) as strict", () => {
		const e = extractAnswer('Here:\n```json\n{"hex":"#fff"}\n```', schema);
		expect(e.strict).toEqual({ ok: true, value: { hex: "#fff" } });
		expect(e.lenient.value).toEqual({ hex: "#fff" });
	});
	it("treats a bare whole-message JSON as strict", () => {
		expect(extractAnswer('{"hex":"#000"}', schema).strict.ok).toBe(true);
	});
	it("finds balanced JSON inside prose; several candidates are lenient-only", () => {
		const e = extractAnswer(
			'First {"hex":"#111"} then {"hex":"#222"} done',
			schema,
		);
		expect(e.candidates).toHaveLength(2);
		expect(e.strict.ok).toBe(false);
		expect(e.lenient.value).toEqual({ hex: "#222" });
	});
	it("lenient takes the last parsing fenced block; invalid blocks do not count as parsed", () => {
		const e = extractAnswer(
			'```\n{"hex":"#111"}\n```\ntext\n```\nnot json\n```',
			schema,
		);
		expect(e.candidates).toHaveLength(2);
		expect(e.strict.ok).toBe(false);
		expect(e.lenient.value).toEqual({ hex: "#111" });
	});
	it("schema-invalid single block is not strict but is lenient", () => {
		const e = extractAnswer('```json\n{"color":"#fff"}\n```', schema);
		expect(e.strict.ok).toBe(false);
		expect(e.lenient.ok).toBe(true);
	});
	it("no JSON is a format failure", () => {
		const e = extractAnswer("The color is red.", schema);
		expect(e.candidates).toHaveLength(0);
		expect(e.lenient.ok).toBe(false);
	});
	it("handles braces inside strings and arrays", () => {
		const e = extractAnswer('Answer: [{"a":"}{"}] ok', { type: "array" });
		expect(e.lenient.value).toEqual([{ a: "}{" }]);
	});
});
