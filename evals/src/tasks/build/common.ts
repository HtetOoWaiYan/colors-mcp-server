import {
	gamutMapOklch,
	hexToRgb,
	type Oklch,
	oklchToRgb,
	type Rgb,
	rgbToHex,
	rgbToOklch,
} from "../../reference/color.js";
import type { Split, Task } from "../types.js";
import { CATEGORY_NAMES } from "../types.js";

export function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const oklchOf = (hex: string): Oklch => rgbToOklch(hexToRgb(hex));

export function mapped(c: Oklch): { hex: string; rgb: Rgb; oklch: Oklch } {
	const m = gamutMapOklch(c);
	const rgb = m.rgb.map((v) => Math.min(1, Math.max(0, v))) as unknown as Rgb;
	return { hex: rgbToHex(rgb), rgb, oklch: m.oklch };
}

export const hexOfOklch = (L: number, C: number, H: number): string =>
	mapped({ L, C, H }).hex;

export const round = (v: number, d = 4): number =>
	Math.round(v * 10 ** d) / 10 ** d;

export function contract(shape: string): string {
	return `Reply with JSON only, in a single \`\`\`json code block, with exactly this shape:\n${shape}`;
}

export function corrupt(v: unknown): unknown {
	if (typeof v === "number") return Math.round((v * 0.5 + 0.3) * 1000) / 1000;
	if (typeof v === "boolean") return !v;
	if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) {
		const n = 0xffffff - Number.parseInt(v.slice(1), 16);
		return `#${n.toString(16).padStart(6, "0")}`;
	}
	if (Array.isArray(v)) return v.map(corrupt);
	if (v && typeof v === "object") {
		return Object.fromEntries(
			Object.entries(v).map(([k, x]) => [k, corrupt(x)]),
		);
	}
	return v;
}

export interface TaskInit {
	category: number;
	n: number;
	prompt: string;
	schema: Record<string, unknown>;
	grader: Task["grader"];
	witness: unknown;
	invalid?: unknown[];
	toolUseful: boolean;
}

// The fourth task of each category is the sealed held-out one.
export function makeTask(t: TaskInit): Task {
	const split: Split = t.n === 4 ? "heldout" : "dev";
	return {
		id: `c${String(t.category).padStart(2, "0")}-${t.n}`,
		category: t.category,
		categoryName: CATEGORY_NAMES[t.category] as string,
		split,
		prompt: t.prompt,
		schema: t.schema,
		grader: t.grader,
		witness: t.witness,
		invalid: t.invalid ?? [{}, corrupt(t.witness)],
		toolUseful: t.toolUseful,
	};
}

export const HEX_SCHEMA = { type: "string", pattern: "^#[0-9a-fA-F]{3,6}$" };
export const objectSchema = (
	props: Record<string, unknown>,
	required = Object.keys(props),
) => ({
	type: "object",
	properties: props,
	required,
});
export const resultsSchema = (item: Record<string, unknown>) =>
	objectSchema({ results: { type: "array", items: item } });

export { oklchToRgb };
