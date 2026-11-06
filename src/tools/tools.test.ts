// biome-ignore-all lint/suspicious/noExplicitAny: loosely typed structuredContent in assertions (shapes are enforced by each outputSchema)
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { hueDiff, parseColor, rgbToOklch } from "../engine/color.js";
import { FORMATS } from "../engine/format.js";
import { TOOLS } from "./index.js";

const oklchOf = (color: string) => rgbToOklch(parseColor(color).rgb);

// Every call also proves the handler's structuredContent satisfies its outputSchema.
function call(name: string, args: Record<string, unknown>) {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool) throw new Error(`no tool ${name}`);
	const parsed = tool.inputSchema.safeParse(args);
	if (!parsed.success) return { invalid: z.prettifyError(parsed.error) };
	const res = tool.handler(parsed.data);
	const text = (res.content[0] as { text: string }).text;
	if (res.structuredContent !== undefined && !res.isError) {
		const out = tool.outputSchema.safeParse(res.structuredContent);
		expect(out.success, out.success ? "" : z.prettifyError(out.error)).toBe(
			true,
		);
	}
	return {
		text,
		sc: res.structuredContent as Record<string, any> | undefined,
		isError: res.isError === true,
	};
}

describe("tool list", () => {
	it("keeps the whole tool list small enough for small models (< 14k characters of JSON Schema)", () => {
		const size = TOOLS.map((t) =>
			JSON.stringify({
				n: t.name,
				d: t.description,
				i: z.toJSONSchema(t.inputSchema),
			}),
		).join("").length;
		expect(size).toBeLessThan(14_000);
	});
	it("keeps every description under 90 words", () => {
		for (const t of TOOLS)
			expect(t.description.split(/\s+/).length, t.name).toBeLessThan(90);
	});
});

describe("colors_check", () => {
	it("leads with the verdict and offers a passing alternative", () => {
		const r = call("colors_check", {
			foreground: "#777777",
			background: "#ffffff",
		});
		expect(r.text).toMatch(/^FAIL: 4\.48:1, needs 4\.5:1/);
		expect(r.sc?.results[0].pass).toBe(false);
		expect(r.sc?.results[0].suggestion).toMatch(/^#[0-9a-f]{6}$/);
	});
	it("passes the edge case 4.54:1", () => {
		const r = call("colors_check", {
			foreground: "#767676",
			background: "#ffffff",
		});
		expect(r.text).toMatch(/^PASS: 4\.54:1/);
	});
	it("checks many pairs and honours level and size", () => {
		const r = call("colors_check", {
			pairs: [
				{ foreground: "#949494", background: "#fff" },
				{ foreground: "#ffcc00", background: "#fff" },
			],
			size: "large",
		});
		expect(r.text).toMatch(
			/^1 of 2 pairs FAIL WCAG AA large text \(need 3:1\)/,
		);
	});
	it("composites translucent text", () => {
		const r = call("colors_check", {
			foreground: "rgba(0,0,0,0.55)",
			background: "#ffffff",
		});
		expect(r.sc?.results[0].foreground).toBe("#737373");
	});
	it("applies the AAA and non-text UI thresholds", () => {
		expect(
			call("colors_check", {
				foreground: "#767676",
				background: "#fff",
				level: "AAA",
			}).text,
		).toMatch(/^FAIL: 4\.54:1, needs 7:1 for WCAG AAA normal text/);
		expect(
			call("colors_check", {
				foreground: "#949494",
				background: "#fff",
				size: "ui",
			}).text,
		).toMatch(/^PASS: [\d.]+:1, needs 3:1 for WCAG AA non-text UI/);
	});
	it("teaches on missing or bad input", () => {
		expect(call("colors_check", {}).text).toMatch(
			/Give a foreground and a background/,
		);
		const bad = call("colors_check", {
			foreground: "tomatoe",
			background: "#fff",
		});
		expect(bad.isError).toBe(true);
		expect(bad.text).toMatch(/Did you mean "tomato"/);
		expect(
			call("colors_check", {
				foreground: "#000",
				background: "#fff",
				level: "A",
			}),
		).toHaveProperty("invalid");
	});
});

describe("colors_fix", () => {
	it("returns one hex that meets the target", () => {
		const r = call("colors_fix", {
			foreground: "#7a9bd1",
			background: "#ffffff",
		});
		expect(r.text).toMatch(/^Use #[0-9a-f]{6} \(was #7a9bd1\)/);
		expect(r.sc?.ratio).toBeGreaterThanOrEqual(4.5);
	});
	it("says when nothing is needed", () => {
		expect(
			call("colors_fix", { foreground: "#000000", background: "#ffffff" }).text,
		).toMatch(/^Already passes/);
	});
	it("explains an impossible request", () => {
		const r = call("colors_fix", {
			foreground: "#808080",
			background: "#7f7f7f",
			target: 21,
		});
		expect(r.text).toMatch(/^No color/);
		expect(r.sc?.found).toBe(false);
	});
});

describe("colors_info", () => {
	it("describes valid colors and flags invalid ones per item", () => {
		const r = call("colors_info", { colors: ["tomato", "#12345"] });
		expect(r.text).toMatch(/^1 of 2 inputs are NOT valid colors/);
		expect(r.sc?.results[0]).toMatchObject({
			valid: true,
			hex: "#ff6347",
			exactName: true,
			bestTextColor: "#000000",
		});
		expect(r.sc?.results[1].valid).toBe(false);
	});
	it("describes white, black and grays (powerless hue must not break formatting)", () => {
		const r = call("colors_info", {
			colors: ["#fff", "#000", "#808080", "hsl(0, 0%, 100%)"],
		});
		expect(r.sc?.results.every((x: any) => x.valid)).toBe(true);
		expect(r.sc?.results[0].hsl).toBe("hsl(0 0% 100%)");
	});
	it("handles alpha and wide gamut", () => {
		const r = call("colors_info", {
			colors: ["rgb(255 0 0 / 50%)", "oklch(0.75 0.25 145)"],
		});
		expect(r.sc?.results[0].alpha).toBe(0.5);
		expect(r.sc?.results[1].inSrgbGamut).toBe(false);
	});
});

describe("colors_convert", () => {
	it("converts lists and reports gamut mapping", () => {
		const r = call("colors_convert", {
			colors: ["#3b82f6", "oklch(0.75 0.25 145)"],
			to: "hex",
		});
		expect(r.sc?.results[0].output).toBe("#3b82f6");
		expect(r.sc?.results[1].gamutMapped).toBe(true);
		expect(r.text).toMatch(/outside sRGB: chroma lowered/);
	});
	it("gives OKLCH values", () => {
		const r = call("colors_convert", { colors: ["#3b82f6"], to: "oklch" });
		expect(r.sc?.results[0].output).toMatch(/^oklch\(0\.623 0\.188 259\.8/);
	});
	it("converts achromatic colors to every format", () => {
		for (const to of FORMATS) {
			const r = call("colors_convert", {
				colors: ["#ffffff", "#000000", "#777777"],
				to,
			});
			expect(r.isError, to).toBe(false);
			expect(r.text, to).not.toMatch(/NaN|null|undefined/);
		}
	});
	it("accepts aliases and produces p3", () => {
		const r = call("colors_convert", {
			colors: ["rgb(255 128 0)"],
			to: "display-p3",
		});
		expect(r.sc?.results[0].output).toMatch(/^color\(display-p3 /);
	});
	it("rejects unknown formats with the list of valid ones", () => {
		const r = call("colors_convert", { colors: ["#fff"], to: "cmyk" });
		expect("invalid" in r && r.invalid).toContain(
			`to must be one of: ${FORMATS.join(", ")}.`,
		);
	});
});

describe("colors_compare", () => {
	it("ranks by CIEDE2000, nearest first", () => {
		const r = call("colors_compare", {
			color: "#2563eb",
			candidates: ["#f97316", "#1d4ed8", "#3b82f6"],
		});
		expect(r.sc?.nearest).toBe("#1d4ed8");
		expect(r.sc?.ranking.map((x: any) => x.color)).toEqual([
			"#1d4ed8",
			"#3b82f6",
			"#f97316",
		]);
		expect(r.text).toMatch(/^Nearest to #2563eb: #1d4ed8 \(ΔE00 /);
	});
});

describe("colors_blend", () => {
	it("returns a gradient with exact endpoints", () => {
		const r = call("colors_blend", {
			colors: ["#2563eb", "#f97316"],
			steps: 5,
		});
		expect(r.sc?.colors).toHaveLength(5);
		expect(r.sc?.colors[0]).toBe("#2563eb");
		expect(r.sc?.colors[4]).toBe("#f97316");
	});
	it("returns one mixed color with `at`, mixed in the chosen space", () => {
		// OKLCH L 0.5 gray is #636363; a straight sRGB average is #808080
		expect(
			call("colors_blend", { colors: ["#000", "#fff"], at: 0.5 }).sc?.colors,
		).toEqual(["#636363"]);
		expect(
			call("colors_blend", {
				colors: ["#000", "#fff"],
				at: 0.5,
				space: "srgb",
			}).sc?.colors,
		).toEqual(["#808080"]);
	});
	it("needs two colors", () => {
		expect(call("colors_blend", { colors: ["#000"] })).toHaveProperty(
			"invalid",
		);
	});
});

describe("colors_adjust", () => {
	it("lowers lightness exactly", () => {
		const r = call("colors_adjust", {
			colors: ["#3b82f6"],
			property: "lightness",
			amount: -0.1,
		});
		expect(r.text).toMatch(/lightness 0\.623 -> 0\.523/);
	});
	it("rotates hue and multiplies chroma by the requested amount", () => {
		const rotated = call("colors_adjust", {
			colors: ["#16a34a"],
			property: "hue",
			amount: 40,
		}).sc?.results[0].output;
		expect(hueDiff(oklchOf(rotated).h, oklchOf("#16a34a").h + 40)).toBeLessThan(
			3,
		);
		const muted = call("colors_adjust", {
			colors: ["#e11d48"],
			property: "chroma",
			mode: "multiply",
			amount: 0.6,
		}).sc?.results[0].output;
		expect(
			Math.abs(oklchOf(muted).c - 0.6 * oklchOf("#e11d48").c),
		).toBeLessThan(0.01);
	});
	it("flags gamut mapping when chroma is pushed past the gamut", () => {
		const r = call("colors_adjust", {
			colors: ["#0ea5e9"],
			property: "chroma",
			mode: "multiply",
			amount: 3,
		});
		expect(r.sc?.results[0].gamutMapped).toBe(true);
	});
});

describe("colors_harmony", () => {
	it("returns the scheme with offsets", () => {
		const r = call("colors_harmony", { color: "#cc7455", scheme: "triadic" });
		expect(r.sc?.colors.map((c: any) => c.hueOffset)).toEqual([0, 120, 240]);
	});
});

describe("colors_vision", () => {
	it("flags a red/green pair as weak under deuteranopia", () => {
		const r = call("colors_vision", {
			colors: ["#d62728", "#2ca02c"],
			type: "deuteranopia",
		});
		expect(r.text).toMatch(/^Some colors become hard to tell apart/);
		expect(r.sc?.separation.deuteranopia).toBeLessThan(10);
	});
	it("simulates a single color", () => {
		expect(
			call("colors_vision", { colors: ["#ff0000"] }).sc?.simulations
				.deuteranopia,
		).toHaveLength(1);
	});
});

describe("colors_palette", () => {
	it("builds an 11-step ramp that contains the seed", () => {
		const r = call("colors_palette", { kind: "ramp", color: "#2563eb" });
		expect(r.sc?.colors).toHaveLength(11);
		expect(r.sc?.colors[r.sc.seedIndex]).toBe("#2563eb");
		expect(r.sc?.names[0]).toBe("50");
	});
	it("builds a theme where every rule passes", () => {
		const r = call("colors_palette", { kind: "theme", color: "#2563eb" });
		expect(r.sc?.contrastRulesPassed).toBe(r.sc?.contrastRulesTotal);
		expect(Object.keys(r.sc?.theme.light)).toContain("on-primary");
		expect(r.text).toContain("JSON: {");
	});
	it("builds a color-blind-safe categorical set", () => {
		const r = call("colors_palette", { kind: "categorical", count: 4 });
		expect(r.sc?.colors).toHaveLength(4);
		expect(r.sc?.separation.deuteranopia).toBeGreaterThan(10);
	});
	it("asks for the missing seed", () => {
		const r = call("colors_palette", { kind: "ramp" });
		expect(r.isError).toBe(true);
		expect(r.text).toMatch(/needs "color"/);
	});
});

describe("colors_audit", () => {
	it("reports findings with fixes", () => {
		const r = call("colors_audit", {
			css: ".note { color: #9ca3af; background-color: #ffffff; }",
		});
		expect(r.text).toMatch(/^1 color problem found/);
		expect(r.sc?.findings[0].suggestion).toMatch(/#[0-9a-f]{6}/);
	});
	it("says so when clean", () => {
		expect(
			call("colors_audit", {
				css: "p { color: #111; background-color: #fff; }",
			}).text,
		).toMatch(/^No color problems found/);
	});
});
