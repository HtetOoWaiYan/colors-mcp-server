import type { VerdictItem } from "../../graders/color-tasks.js";
import type { ConvertItem, ParseItem } from "../../graders/convert.js";
import {
	compositeOver,
	contrastRatio,
	hexToRgb,
	oklchToRgb,
	type Rgb,
	rgbToHex,
	rgbToOklab,
	rgbToOklch,
	rgbToP3,
} from "../../reference/color.js";
import { parseCss } from "../../reference/css.js";
import type { Task } from "../types.js";
import {
	contract,
	HEX_SCHEMA,
	makeTask,
	mapped,
	objectSchema,
	resultsSchema,
	round,
} from "./common.js";

type Src = {
	text: string;
	rgb: Rgb;
	oklch?: { L: number; C: number; H: number };
};
const hexSrc = (hex: string): Src => ({ text: hex, rgb: hexToRgb(hex) });
const okSrc = (L: number, C: number, H: number): Src => ({
	text: `oklch(${L} ${C} ${H})`,
	rgb: oklchToRgb({ L, C, H }),
	oklch: { L, C, H },
});
const parsedSrc = (css: string): Src => ({
	text: css,
	rgb: (parseCss(css) as { rgb: Rgb }).rgb,
});

const TARGET_SHAPE: Record<ConvertItem["to"], string> = {
	hex: '{"hex": "#rrggbb"}',
	oklch: '{"l": number, "c": number, "h": degrees}',
	oklab: '{"l": number, "a": number, "b": number}',
	p3: '{"r": number, "g": number, "b": number} (display-p3 channels, each 0 to 1)',
};

function convertTask(
	n: number,
	items: { src: Src; to: ConvertItem["to"] }[],
	gamutNote: boolean,
) {
	const gi: ConvertItem[] = [];
	const witness: unknown[] = [];
	for (const { src, to } of items) {
		if (to === "hex") {
			const c = src.oklch ?? rgbToOklch(src.rgb);
			const m = src.oklch
				? mapped(c)
				: { hex: rgbToHex(src.rgb), rgb: src.rgb };
			gi.push({ to, expected: {}, rgb: m.rgb as [number, number, number] });
			witness.push({ hex: m.hex });
		} else if (to === "oklch") {
			const c = rgbToOklch(src.rgb);
			gi.push({ to, expected: { l: c.L, c: c.C, h: c.H } });
			witness.push({ l: round(c.L), c: round(c.C), h: round(c.H, 2) });
		} else if (to === "oklab") {
			const [l, a, b] = rgbToOklab(src.rgb);
			gi.push({ to, expected: { l, a, b } });
			witness.push({ l: round(l), a: round(a), b: round(b) });
		} else {
			const [r, g, b] = rgbToP3(src.rgb);
			gi.push({ to, expected: { r, g, b } });
			witness.push({ r: round(r), g: round(g), b: round(b) });
		}
	}
	const lines = items
		.map(
			(it, i) => `${i + 1}. ${it.src.text} -> ${it.to}: ${TARGET_SHAPE[it.to]}`,
		)
		.join("\n");
	const prompt = `Convert each color to the target format given. ${
		gamutNote
			? "Where an oklch color is outside the sRGB gamut, return the displayable sRGB color with the same lightness and hue and the largest chroma that fits (reduce chroma only)."
			: ""
	}\n\n${lines}\n\n${contract('{"results": [ one object per color, in the order above, using the object shapes shown ]}')}`;
	return makeTask({
		category: 1,
		n,
		prompt,
		schema: resultsSchema({ type: "object" }),
		grader: { kind: "convert", params: { items: gi } },
		witness: { results: witness },
		toolUseful: true,
	});
}

export function cat1(): Task[] {
	return [
		convertTask(
			1,
			[
				{ src: hexSrc("#3b82f6"), to: "oklch" },
				{ src: hexSrc("#808080"), to: "oklch" },
				{ src: hexSrc("#ff0000"), to: "oklab" },
			],
			false,
		),
		convertTask(
			2,
			[
				{ src: okSrc(0.7, 0.15, 30), to: "hex" },
				{ src: okSrc(0.45, 0.12, 265), to: "hex" },
				{ src: parsedSrc("hsl(200, 80%, 50%)"), to: "hex" },
			],
			true,
		),
		convertTask(
			3,
			[
				{ src: okSrc(0.75, 0.25, 145), to: "hex" },
				{ src: okSrc(0.6, 0.3, 20), to: "hex" },
				{ src: hexSrc("#ffffff"), to: "oklch" },
			],
			true,
		),
		convertTask(
			4,
			[
				{ src: parsedSrc("rgb(255, 128, 0)"), to: "p3" },
				{ src: hexSrc("#1e90ff"), to: "oklab" },
				{ src: okSrc(0.65, 0.28, 330), to: "hex" },
			],
			true,
		),
	];
}

const PARSE_RULES =
	"Supported formats: #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla() (commas or spaces; percentages allowed), and these CSS color names (any letter case): black, white, red, lime, blue, yellow, navy, teal, gold, tomato, coral, salmon, indigo, crimson, orchid, chocolate, skyblue, slategray, darkslategray, olive, maroon, gray, silver, orange, green, purple, rebeccapurple, lightgoldenrodyellow, whitesmoke, dodgerblue. Anything else is invalid.";

function parseTask(n: number, inputs: string[]) {
	const items: ParseItem[] = inputs.map((input) => {
		const p = parseCss(input);
		return p
			? {
					input,
					valid: true,
					hex: rgbToHex(p.rgb),
					alpha: Math.round(p.alpha * 100) / 100,
				}
			: { input, valid: false, hex: null, alpha: null };
	});
	const witness = {
		results: items.map((i) => ({
			input: i.input,
			valid: i.valid,
			hex: i.hex,
			alpha: i.alpha,
		})),
	};
	const list = inputs
		.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`)
		.join("\n");
	const prompt = `Decide for each input string whether it is a valid color and, if so, give its sRGB hex (ignoring alpha) and alpha (1 when none is given, a number from 0 to 1 otherwise). For an invalid input use valid false, hex null, alpha null. Never guess a value for an invalid input.\n${PARSE_RULES}\n\n${list}\n\n${contract('{"results": [{"input": "<the input string>", "valid": boolean, "hex": "#rrggbb" or null, "alpha": number or null}, ... one per input, in order]}')}`;
	return makeTask({
		category: 2,
		n,
		prompt,
		schema: resultsSchema({ type: "object" }),
		grader: { kind: "parse", params: { items } },
		witness,
		toolUseful: true,
	});
}

export function cat2(): Task[] {
	return [
		parseTask(1, [
			"#FF8800",
			"#f80",
			"rgb(12, 34, 56)",
			"hsl(210, 50%, 40%)",
			"#12345",
			"rgb(10, 20)",
			"tomato",
			"bluish",
		]),
		parseTask(2, [
			"rgb(255 0 0 / 50%)",
			"rgba(0, 128, 255, 0.25)",
			"#00ff0080",
			"hsla(120, 100%, 25%, 0.5)",
			"#ggg",
			"hsl(120, 50%, 50%",
			"rgba(1, 2, 3, 4, 5)",
			"rebeccapurple",
		]),
		parseTask(3, [
			"DARKSLATEGRAY",
			"#FFF",
			"rgb(0%, 100%, 20%)",
			"hsl(0, 0%, 100%)",
			"hsl(360, 100%, 50%)",
			"#12",
			"rgb(1, 2, 3",
			"#abcdef",
		]),
		parseTask(4, [
			"#0F0",
			"lightgoldenrodyellow",
			"rgb(255,255,255)",
			"hsl(240, 100%, 50%)",
			"color(display-p3 1 0 0)",
			"#fffffff",
			"blue2",
			"rgba(255, 0, 0, 0.5)",
		]),
	];
}

interface VItem {
	fg: string;
	bg: string;
	alpha?: number;
	threshold: number;
}

function verdictTask(n: number, items: VItem[], intro: string) {
	const gi: VerdictItem[] = items.map((it) => {
		const fgEff =
			it.alpha === undefined
				? it.fg
				: rgbToHex(compositeOver(hexToRgb(it.fg), it.alpha, hexToRgb(it.bg)));
		const ratio = contrastRatio(fgEff, it.bg);
		return { threshold: it.threshold, ratio, pass: ratio >= it.threshold };
	});
	const lines = items
		.map((it, i) => {
			const fg =
				it.alpha === undefined ? it.fg : `${it.fg} at ${it.alpha} opacity`;
			return `${i + 1}. text ${fg} on background ${it.bg}, required ratio ${it.threshold}:1`;
		})
		.join("\n");
	const witness = {
		results: gi.map((g) => ({
			pass: g.pass,
			ratio: Math.round(g.ratio * 100) / 100,
		})),
	};
	const prompt = `${intro} Compute the WCAG 2 contrast ratio for each pair (with partially transparent text, first composite it over the background color; round the composited color to 8-bit hex before computing the ratio). "pass" is true only if the ratio is at least the required ratio.\n\n${lines}\n\n${contract('{"results": [{"pass": boolean, "ratio": number rounded to 2 decimals}, ... one per pair, in order]}')}`;
	return makeTask({
		category: 3,
		n,
		prompt,
		schema: resultsSchema({ type: "object" }),
		grader: { kind: "verdict", params: { items: gi } },
		witness,
		toolUseful: true,
	});
}

export function cat3(): Task[] {
	return [
		verdictTask(
			1,
			[
				{ fg: "#767676", bg: "#ffffff", threshold: 4.5 },
				{ fg: "#777777", bg: "#ffffff", threshold: 4.5 },
				{ fg: "#2563eb", bg: "#ffffff", threshold: 4.5 },
			],
			"Check body-text contrast.",
		),
		verdictTask(
			2,
			[
				{ fg: "#949494", bg: "#ffffff", threshold: 3 },
				{ fg: "#ffcc00", bg: "#ffffff", threshold: 4.5 },
				{ fg: "#ffffff", bg: "#2563eb", threshold: 4.5 },
				{ fg: "#6b7280", bg: "#f3f4f6", threshold: 4.5 },
			],
			"Check text and UI contrast.",
		),
		verdictTask(
			3,
			[
				{ fg: "#000000", alpha: 0.55, bg: "#ffffff", threshold: 4.5 },
				{ fg: "#ffffff", alpha: 0.8, bg: "#1e3a8a", threshold: 4.5 },
				{ fg: "#000000", alpha: 0.6, bg: "#ffeb3b", threshold: 4.5 },
			],
			"Check translucent text.",
		),
		verdictTask(
			4,
			[
				{ fg: "#555555", bg: "#ffffff", threshold: 7 },
				{ fg: "#5f5f5f", bg: "#ffffff", threshold: 7 },
				{ fg: "#1d4ed8", bg: "#ffffff", threshold: 7 },
				{ fg: "#0f172a", bg: "#e2e8f0", threshold: 7 },
			],
			"Check enhanced (AAA) contrast.",
		),
	];
}

export { HEX_SCHEMA, objectSchema };
