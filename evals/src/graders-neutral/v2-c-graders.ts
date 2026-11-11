/**
 * Author C's v2 grader additions. v1's tonal-scale grader (c-graders.ts) checks at most one WCAG 2
 * pairing between two steps of the scale. Several v2 scale tasks state more than one pairing, and
 * some pair a step with a fixed color that is not in the scale (for example white button text on
 * step 600). This kind runs every v1 scale check unchanged and adds one named check per pairing.
 */
import { chk, normHex } from "../graders/helpers.js";
import { contrast } from "../reference-neutral/c-color.js";
import type { Check } from "../tasks/types.js";
import { gradeScale, type ScaleParams } from "./c-graders.js";

const EPS = 1e-9;

export interface Scale2Params extends Omit<ScaleParams, "contrast"> {
	/** WCAG 2 minimum between two steps of the scale (symmetric ratio, fg/bg only name the check). */
	pairs?: { fg: string; bg: string; min: number }[];
	/** WCAG 2 minimum between a step and a fixed color outside the scale. */
	against?: { step: string; color: string; label: string; min: number }[];
}

function stepHex(answer: unknown, key: string): string {
	const s = (answer as { scale?: Record<string, unknown> } | null)?.scale;
	if (typeof s !== "object" || s === null || Array.isArray(s)) throw new Error("no scale");
	return normHex(s[key]);
}

export function gradeScale2(answer: unknown, p: Scale2Params): Check[] {
	// v1's scale grader reads p.seed etc. directly, so a missing params object is a failed check here.
	if (typeof p !== "object" || p === null) return [chk("valid-params", () => false)];
	const checks = gradeScale(answer, p as ScaleParams);
	for (const pr of p?.pairs ?? [])
		checks.push(
			chk(`contrast-${pr.fg}-on-${pr.bg}`, () => contrast(stepHex(answer, pr.fg), stepHex(answer, pr.bg)) >= pr.min - EPS),
		);
	for (const a of p?.against ?? [])
		checks.push(
			chk(`contrast-${a.step}-vs-${a.label}`, () => contrast(stepHex(answer, a.step), normHex(a.color)) >= a.min - EPS),
		);
	return checks;
}
