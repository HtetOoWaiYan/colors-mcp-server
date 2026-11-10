import type { Check } from "../tasks/types.js";
import { gradeTable } from "./a-table.js";

type GraderFn = (answer: unknown, params: never) => Check[];

/**
 * Neutral-suite grader kinds (all prefixed `neutral-`). Author A's four categories share one table
 * engine; the kind names keep each category's tasks traceable.
 */
export const REGISTRY_A: Record<string, GraderFn> = {
	"neutral-apca-contrast": gradeTable,
	"neutral-delta-e": gradeTable,
	"neutral-space-conversion": gradeTable,
	"neutral-color-properties": gradeTable,
};
