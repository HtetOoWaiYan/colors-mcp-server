import { gradeEvery } from "../graders-fresh/index.js";
import type { Check, GraderSpec } from "../tasks/types.js";
import { REGISTRY_A } from "./registry-a.js";
import { REGISTRY_B } from "./registry-b.js";
import { REGISTRY_C } from "./registry-c.js";
import { REGISTRY2_A } from "./registry2-a.js";
import { REGISTRY2_B } from "./registry2-b.js";
import { REGISTRY2_C } from "./registry2-c.js";
import { REGISTRY3_A } from "./registry3-a.js";
import { REGISTRY3_B } from "./registry3-b.js";
import { REGISTRY3_C } from "./registry3-c.js";

type GraderFn = (answer: unknown, params: never) => Check[];

// Kept apart from the frozen v1, generalization and fresh registries so these cannot change their grader hashes.
const NEUTRAL_REGISTRY: Record<string, GraderFn> = {
	...REGISTRY_A,
	...REGISTRY_B,
	...REGISTRY_C,
	// v2 reuses v1 kinds where they fit and adds its own in registry2-*; v1 grader code is untouched.
	...REGISTRY2_A,
	...REGISTRY2_B,
	...REGISTRY2_C,
	...REGISTRY3_A,
	...REGISTRY3_B,
	...REGISTRY3_C,
};

/** Grades a task from any suite: neutral kinds here, everything else by the earlier registries. */
export function gradeNeutral(spec: GraderSpec, answer: unknown): Check[] {
	const fn = NEUTRAL_REGISTRY[spec.kind];
	return fn ? fn(answer, spec.params as never) : gradeEvery(spec, answer);
}
