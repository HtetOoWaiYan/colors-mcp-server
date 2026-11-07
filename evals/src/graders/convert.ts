import { hexToRgb, hueDiff, type Rgb } from "../reference/color.js";
import type { Check } from "../tasks/types.js";
import { chk, get, isHexStr, isNum, rgbOf } from "./helpers.js";

export interface ConvertItem {
	to: "hex" | "oklch" | "oklab" | "p3";
	expected: Record<string, number>;
	/** For `hex` targets: the expected (unrounded, gamut-mapped) sRGB channels. */
	rgb?: [number, number, number];
}

const close = (a: unknown, b: number, tol: number) =>
	isNum(a) && Math.abs(a - b) <= tol;

export function gradeConvert(
	answer: unknown,
	params: { items: ConvertItem[] },
): Check[] {
	return params.items.map((item, i) =>
		chk(`item${i}`, () => {
			const r = get(answer, "results", i);
			const e = item.expected;
			switch (item.to) {
				case "hex": {
					const got: Rgb = rgbOf(get(r, "hex"));
					const want = item.rgb as [number, number, number];
					return got.every(
						(v, k) => Math.abs(v - (want[k] as number)) <= 0.002,
					);
				}
				case "oklab":
					return (
						close(get(r, "l"), e.l as number, 0.005) &&
						close(get(r, "a"), e.a as number, 0.005) &&
						close(get(r, "b"), e.b as number, 0.005)
					);
				case "oklch": {
					const hueSkipped = (e.c as number) < 0.02;
					const h = get(r, "h");
					return (
						close(get(r, "l"), e.l as number, 0.005) &&
						close(get(r, "c"), e.c as number, 0.005) &&
						(hueSkipped || (isNum(h) && hueDiff(h, e.h as number) <= 0.5))
					);
				}
				case "p3":
					return (
						close(get(r, "r"), e.r as number, 0.002) &&
						close(get(r, "g"), e.g as number, 0.002) &&
						close(get(r, "b"), e.b as number, 0.002)
					);
			}
		}),
	);
}

export interface ParseItem {
	input: string;
	valid: boolean;
	hex: string | null;
	alpha: number | null;
}

export function gradeParse(
	answer: unknown,
	params: { items: ParseItem[] },
): Check[] {
	return params.items.map((item, i) =>
		chk(`item${i}`, () => {
			const r = get(answer, "results", i);
			if (get(r, "input") !== item.input) return false;
			if (get(r, "valid") !== item.valid) return false;
			if (!item.valid) return get(r, "hex") === null;
			const hex = get(r, "hex");
			if (!isHexStr(hex)) return false;
			const a = hexToRgb(hex);
			const e = hexToRgb(item.hex as string);
			if (!a.every((v, k) => Math.abs(v - (e[k] as number)) < 1e-9))
				return false;
			return close(get(r, "alpha"), item.alpha as number, 0.01);
		}),
	);
}
