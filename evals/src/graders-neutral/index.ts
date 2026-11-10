import { gradeEvery } from "../graders-fresh/index.js";
import type { Check, GraderSpec } from "../tasks/types.js";
import { REGISTRY_A } from "./registry-a.js";
import { REGISTRY_B } from "./registry-b.js";
import { REGISTRY_C } from "./registry-c.js";

type GraderFn = (answer: unknown, params: never) => Check[];

// Kept apart from the frozen v1, generalization and fresh registries so these cannot change their grader hashes.
const NEUTRAL_REGISTRY: Record<string, GraderFn> = {
	...REGISTRY_A,
	...REGISTRY_B,
	...REGISTRY_C,
};

/** Grades a task from any suite: neutral kinds here, everything else by the earlier registries. */
export function gradeNeutral(spec: GraderSpec, answer: unknown): Check[] {
	const fn = NEUTRAL_REGISTRY[spec.kind];
	return fn ? fn(answer, spec.params as never) : gradeEvery(spec, answer);
}
