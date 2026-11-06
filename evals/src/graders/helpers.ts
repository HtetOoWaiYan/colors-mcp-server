import { hexToRgb, isHex, type Rgb, rgbToHex } from "../reference/color.js";
import type { Check } from "../tasks/types.js";

/** Runs a predicate; any throw (missing fields, wrong types) is a failed check, never a crash. */
export function chk(name: string, fn: () => boolean): Check {
	try {
		return { name, pass: fn() === true };
	} catch {
		return { name, pass: false };
	}
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

export const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);

export const isHexStr = (v: unknown): v is string =>
	typeof v === "string" && isHex(v);

/** Normalizes #rgb/#RRGGBB to lowercase #rrggbb. Throws if not hex. */
export function normHex(v: unknown): string {
	if (!isHexStr(v)) throw new Error("not hex");
	return rgbToHex(hexToRgb(v));
}

export function rgbOf(v: unknown): Rgb {
	if (!isHexStr(v)) throw new Error("not hex");
	return hexToRgb(v);
}

export function get(obj: unknown, ...path: (string | number)[]): unknown {
	let cur: unknown = obj;
	for (const k of path) {
		if (cur === null || cur === undefined) return undefined;
		cur = (cur as Record<string | number, unknown>)[k];
	}
	return cur;
}
