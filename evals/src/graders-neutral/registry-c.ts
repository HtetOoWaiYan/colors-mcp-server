import type { Check } from "../tasks/types.js";
import { gradeAudit, gradeRoles, gradeScale, gradeSearch } from "./c-graders.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/** Neutral-suite grader kinds (all prefixed `neutral-`), one constraint grader per author-C category. */
export const REGISTRY_C: Record<string, GraderFn> = {
	"neutral-tonal-scale": gradeScale as GraderFn,
	"neutral-role-tokens": gradeRoles as GraderFn,
	"neutral-constraint-search": gradeSearch as GraderFn,
	"neutral-palette-audit": gradeAudit as GraderFn,
};
