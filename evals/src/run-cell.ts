import { extractAnswer } from "./extract.js";
import { gradeAny as grade } from "./graders-gen/index.js";
import type { CellRecord, Outcome } from "./record.js";
import { type AgentRun, runAgent, SYSTEM_PROMPT } from "./runner/agent-loop.js";
import { connectServer, type ServerSpec } from "./runner/mcp-bridge.js";
import type { Provider, ToolHost } from "./runner/types.js";
import type { Task } from "./tasks/types.js";

export interface CellInput {
	provider: Provider;
	task: Task;
	trial: number;
	condition: string;
	/** Undefined for the no-tools condition. */
	server?: ServerSpec;
	profile?: "tni" | "instructions";
}

export interface CellResult {
	cell: Pick<
		CellRecord,
		| "status"
		| "outcome"
		| "checks"
		| "checkScore"
		| "strictOk"
		| "strictPass"
		| "run"
		| "infraDetail"
	>;
	rateLimited: boolean;
}

// Precedence is fixed by the spec: infra and limit first, then format, then grading.
function classify(
	run: AgentRun,
	task: Task,
): {
	outcome: Outcome;
	checks?: CellRecord["checks"];
	strictOk?: boolean;
	strictPass?: boolean;
} {
	if (run.end === "infra_failed") return { outcome: "infra_failed" };
	if (run.end === "limit_exhausted") return { outcome: "limit_exhausted" };
	const ex = extractAnswer(run.finalText, task.schema);
	if (!ex.lenient.ok)
		return { outcome: run.truncation ? "limit_exhausted" : "format_failure" };
	const checks = grade(task.grader, ex.lenient.value);
	const strictPass = ex.strict.ok
		? grade(task.grader, ex.strict.value).every((c) => c.pass)
		: false;
	return {
		outcome: checks.every((c) => c.pass) ? "pass" : "semantic_failure",
		checks,
		strictOk: ex.strict.ok,
		strictPass,
	};
}

export async function executeCell(input: CellInput): Promise<CellResult> {
	let host: ToolHost | undefined;
	try {
		if (input.server) host = await connectServer(input.server);
	} catch (e) {
		return {
			rateLimited: false,
			cell: {
				status: "infra_failed",
				outcome: "infra_failed",
				infraDetail: (e as Error).message,
			},
		};
	}
	let run: AgentRun;
	try {
		const system =
			input.profile === "instructions" && host?.instructions
				? `${SYSTEM_PROMPT}\n\nServer instructions:\n${host.instructions}`
				: SYSTEM_PROMPT;
		run = await runAgent({
			provider: input.provider,
			prompt: input.task.prompt,
			host,
			system,
		});
	} finally {
		await host?.close();
	}
	if (run.end === "rate_limited") {
		return {
			rateLimited: true,
			cell: {
				status: "infra_failed",
				outcome: "infra_failed",
				infraDetail: run.endDetail,
				run,
			},
		};
	}
	const c = classify(run, input.task);
	if (c.outcome === "infra_failed") {
		return {
			rateLimited: false,
			cell: {
				status: "infra_failed",
				outcome: "infra_failed",
				infraDetail: run.endDetail,
				run,
			},
		};
	}
	return {
		rateLimited: false,
		cell: {
			status: "done",
			outcome: c.outcome,
			checks: c.checks,
			checkScore: c.checks
				? c.checks.filter((x) => x.pass).length / c.checks.length
				: 0,
			strictOk: c.strictOk,
			strictPass: c.strictPass,
			run,
		},
	};
}
