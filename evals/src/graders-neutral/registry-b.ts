import type { Check } from "../tasks/types.js";
import { gradeB } from "./b-checks.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/**
 * Neutral-suite grader kinds (all prefixed `neutral-`). Author B's four categories share one
 * check engine; the kind names keep each category's tasks traceable.
 */
export const REGISTRY_B: Record<string, GraderFn> = {
	"neutral-cvd-simulation": gradeB,
	"neutral-interpolation": gradeB,
	"neutral-harmony": gradeB,
	"neutral-naming-and-text-color": gradeB,
};
