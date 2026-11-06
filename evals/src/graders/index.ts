import type { Check, GraderSpec } from "../tasks/types.js";
import {
	gradeAdjust,
	gradeAudit,
	gradeDeutan,
	gradeFix,
	gradeGradient,
	gradeHarmony,
	gradeNearest,
	gradeRamp,
	gradeTheme,
	gradeTrap,
	gradeVerdict,
} from "./color-tasks.js";
import { gradeConvert, gradeParse } from "./convert.js";

type GraderFn = (answer: unknown, params: never) => Check[];

const REGISTRY: Record<string, GraderFn> = {
	convert: gradeConvert as GraderFn,
	parse: gradeParse as GraderFn,
	verdict: gradeVerdict as GraderFn,
	fix: gradeFix as GraderFn,
	adjust: gradeAdjust as GraderFn,
	gradient: gradeGradient as GraderFn,
	nearest: gradeNearest as GraderFn,
	ramp: gradeRamp as GraderFn,
	theme: gradeTheme as GraderFn,
	harmony: gradeHarmony as GraderFn,
	deutan: gradeDeutan as GraderFn,
	audit: gradeAudit as GraderFn,
	trap: gradeTrap as GraderFn,
};

/** End-to-end: composes the other graders over named sub-answers; check names get the part key as prefix. */
function gradeComposite(
	answer: unknown,
	params: { parts: { key: string; grader: GraderSpec }[] },
): Check[] {
	return params.parts.flatMap((part) => {
		const sub =
			answer !== null && typeof answer === "object"
				? (answer as Record<string, unknown>)[part.key]
				: undefined;
		return grade(part.grader, sub).map((c) => ({
			name: `${part.key}:${c.name}`,
			pass: c.pass,
		}));
	});
}

export function grade(spec: GraderSpec, answer: unknown): Check[] {
	if (spec.kind === "composite") return gradeComposite(answer, spec.params);
	const fn = REGISTRY[spec.kind];
	if (!fn) throw new Error(`unknown grader kind: ${spec.kind}`);
	return fn(answer, spec.params as never);
}
