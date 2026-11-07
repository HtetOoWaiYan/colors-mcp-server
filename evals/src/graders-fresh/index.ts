import { gradeAny } from "../graders-gen/index.js";
import type { Check, GraderSpec } from "../tasks/types.js";
import { gradeDivergingN, gradeGradientText } from "./tasks.js";

type GraderFn = (answer: unknown, params: never) => Check[];

// Kept apart from the frozen v1 and generalization registries so adding these cannot change their grader hashes.
const FRESH_REGISTRY: Record<string, GraderFn> = {
	"fresh-diverging": gradeDivergingN as GraderFn,
	"fresh-gradient-text": gradeGradientText as GraderFn,
};

/** Grades a task from any suite: fresh kinds here, everything else by the generalization and v1 graders. */
export function gradeEvery(spec: GraderSpec, answer: unknown): Check[] {
	const fn = FRESH_REGISTRY[spec.kind];
	return fn ? fn(answer, spec.params as never) : gradeAny(spec, answer);
}
