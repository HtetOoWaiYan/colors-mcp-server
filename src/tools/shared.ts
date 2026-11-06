import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	ColorError,
	clamp01,
	type Parsed,
	parseColor,
	type Rgb,
	rgbToHex,
} from "../engine/color.js";

export const MAX_COLORS = 50;

export const colorField = (what: string) =>
	z
		.string()
		.min(1)
		.describe(
			`${what}. Any CSS color: "#3b82f6", "rgb(59 130 246)", "oklch(0.62 0.19 260)", "tomato".`,
		);

export const colorsField = (what: string, max = MAX_COLORS) =>
	z
		.array(z.string().min(1))
		.min(1, "Pass at least one color in the list.")
		.max(max, `Pass at most ${max} colors per call; split into several calls.`)
		.describe(
			`${what} A list, even for a single color. Any CSS color strings.`,
		);

export function text(
	t: string,
	structured?: Record<string, unknown>,
	isError = false,
): CallToolResult {
	return {
		content: [{ type: "text", text: t }],
		...(structured ? { structuredContent: structured } : {}),
		...(isError ? { isError: true } : {}),
	};
}

export function fail(t: string): CallToolResult {
	return text(t, undefined, true);
}

// Collects every problem so the caller can fix them in one retry.
export function parseAll(
	inputs: string[],
	label = "colors",
): { ok: Parsed[] } | { error: CallToolResult } {
	const ok: Parsed[] = [];
	const problems: string[] = [];
	inputs.forEach((raw, i) => {
		try {
			ok.push(parseColor(raw));
		} catch (e) {
			problems.push(`${label}[${i}]: ${(e as Error).message}`);
		}
	});
	if (problems.length > 0) {
		return {
			error: fail(
				`${problems.length === 1 ? "1 color" : `${problems.length} colors`} could not be read, nothing was computed. ${problems.join(" ")}`,
			),
		};
	}
	return { ok };
}

export function parseOne(
	raw: string,
	label: string,
): { ok: Parsed } | { error: CallToolResult } {
	try {
		return { ok: parseColor(raw) };
	} catch (e) {
		return { error: fail(`${label}: ${(e as Error).message}`) };
	}
}

export const hex = (rgb: Rgb, alpha = 1): string => rgbToHex(rgb, alpha);

export const fmt = (v: number, d = 2): string => {
	const r = Number(v.toFixed(d));
	return String(Object.is(r, -0) ? 0 : r);
};

// A ColorError becomes a readable tool error instead of a protocol failure.
export function guarded<A>(
	fn: (args: A) => CallToolResult,
): (args: A) => CallToolResult {
	return (args) => {
		try {
			return fn(args);
		} catch (e) {
			if (e instanceof ColorError) return fail(e.message);
			throw e;
		}
	};
}

export { clamp01 };
