import { grade } from "../graders/index.js";
import type { Check, GraderSpec } from "../tasks/types.js";
import {
	gradeDiverging,
	gradeGrayscale,
	gradeMix,
	gradePick,
	gradeScrim,
	gradeYcbcr,
} from "./tasks.js";

type GraderFn = (answer: unknown, params: never) => Check[];

// Kept apart from the frozen v1 registry so adding these graders cannot change v1's grader hash.
const GEN_REGISTRY: Record<string, GraderFn> = {
	"gen-pick": gradePick as GraderFn,
	"gen-scrim": gradeScrim as GraderFn,
	"gen-mix": gradeMix as GraderFn,
	"gen-grayscale": gradeGrayscale as GraderFn,
	"gen-diverging": gradeDiverging as GraderFn,
	"gen-ycbcr": gradeYcbcr as GraderFn,
};

/** Grades a task from any suite: generalization kinds here, every other kind by the v1 grader. */
export function gradeAny(spec: GraderSpec, answer: unknown): Check[] {
	const fn = GEN_REGISTRY[spec.kind];
	return fn ? fn(answer, spec.params as never) : grade(spec, answer);
}
