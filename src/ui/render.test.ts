// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type Json, render } from "../../ui/src/render.js";
import { TOOLS } from "../tools/index.js";

// Real tool output, so a renamed structuredContent field breaks the view test too.
function view(name: string, args: Record<string, unknown>): HTMLElement {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool) throw new Error(`no tool ${name}`);
	const res = tool.handler(tool.inputSchema.parse(args));
	return render(res.structuredContent as Json);
}

const text = (el: HTMLElement) => el.textContent ?? "";

describe("viewer render() on real tool results", () => {
	it("shows a contrast check with verdict, sample and suggestion", () => {
		const el = view("colors_check", {
			foreground: "#777777",
			background: "#ffffff",
		});
		expect(text(el)).toContain("some fail");
		expect(text(el)).toContain("FAIL");
		expect(text(el)).toContain("4.48:1");
		expect(text(el)).toMatch(/Passing text color:#[0-9a-f]{6}/);
		expect(el.querySelector(".sample")?.getAttribute("style")).toContain(
			"color:#777777",
		);
	});

	it("shows a ramp with the seed step marked", () => {
		const el = view("colors_palette", { kind: "ramp", color: "#2563eb" });
		const cells = Array.from(el.querySelectorAll<HTMLElement>(".strip div"));
		expect(cells).toHaveLength(11);
		const starred = cells.filter((d) => text(d).includes("★"));
		expect(starred.map((d) => d.title)).toEqual(["#2563eb"]);
	});

	it("shows a theme as two panels with the rule count", () => {
		const el = view("colors_palette", { kind: "theme", color: "#2563eb" });
		expect(text(el)).toContain("light theme");
		expect(text(el)).toContain("dark theme");
		expect(text(el)).toMatch(/(\d+)\/\1 contrast rules pass/);
	});

	const views: [string, Record<string, unknown>, string][] = [
		[
			"colors_blend",
			{ colors: ["#000000", "#ffffff"], steps: 3 },
			"Gradient (oklch)",
		],
		[
			"colors_compare",
			{ color: "#2563eb", candidates: ["#f97316", "#1d4ed8"] },
			"Closest: #1d4ed8",
		],
		[
			"colors_vision",
			{ colors: ["#d62728", "#2ca02c"], type: "deuteranopia" },
			"Weakest pair (ΔE00): normal ",
		],
		["colors_harmony", { color: "#cc7455", scheme: "triadic" }, "+240°"],
		[
			"colors_audit",
			{ css: ".note { color: #9ca3af; background-color: #ffffff; }" },
			"text-contrast-aa .note",
		],
		["colors_convert", { colors: ["tomato"], to: "hex" }, "tomato→#ff6347"],
		["colors_info", { colors: ["tomato"] }, "tomato→#ff6347"],
	];
	for (const [name, args, expected] of views) {
		it(`renders ${name} with its own view`, () => {
			expect(text(view(name, args))).toContain(expected);
		});
	}

	it("falls back to JSON for unknown shapes and never throws on odd input", () => {
		expect(text(render({ something: 1 }))).toContain("something");
		expect(() => render({ results: [{}] })).not.toThrow();
		expect(() => render({ kind: "ramp" })).not.toThrow();
	});
});
