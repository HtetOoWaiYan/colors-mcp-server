import { graderHash } from "./identity.js";
import {
	type CellRecord,
	type KeyInputs,
	type ResultStore,
	resumeKey,
	sha256,
} from "./record.js";
import { executeCell } from "./run-cell.js";
import { SYSTEM_PROMPT } from "./runner/agent-loop.js";
import type { ServerSpec } from "./runner/mcp-bridge.js";
import type { Provider } from "./runner/types.js";
import { mulberry32 } from "./tasks/build/common.js";
import type { Task } from "./tasks/types.js";

export interface ModelSpec {
	id: string;
	modelName: string;
	provider: Provider;
}

export interface ConditionSpec {
	name: string;
	server?: ServerSpec;
	sha?: string;
	toolDefsHash?: string;
	lockHash?: string;
}

export interface MatrixOptions {
	store: ResultStore;
	models: ModelSpec[];
	conditions: ConditionSpec[];
	tasks: Task[];
	taskHashes: Record<string, string>;
	trials: number;
	profile?: "tni" | "instructions";
	maxAttempts?: number;
	log?: (line: string) => void;
	shouldStop?: () => boolean;
}

export interface MatrixSummary {
	ran: number;
	skipped: number;
	infraFailed: number;
	stoppedBy?: "rate_limit" | "interrupt";
	pending: number;
}

const GENERATION = {
	max_tokens: 4096,
	temperature: "provider default",
} as const;

function shuffled<T>(xs: T[], seed: string): T[] {
	const rnd = mulberry32(Number.parseInt(sha256(seed).slice(0, 8), 16));
	const a = [...xs];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[a[i], a[j]] = [a[j] as T, a[i] as T];
	}
	return a;
}

function keyFor(
	o: MatrixOptions,
	model: ModelSpec,
	cond: ConditionSpec,
	task: Task,
	gh: string,
): string {
	const inputs: KeyInputs = {
		serverSha: cond.sha ?? null,
		taskHash: o.taskHashes[task.id] as string,
		graderHash: gh,
		systemPrompt: SYSTEM_PROMPT,
		toolDefsHash: cond.toolDefsHash ?? null,
		clientProfile: o.profile ?? "tni",
		generation: GENERATION,
		model: model.modelName,
		lockHash: cond.lockHash ?? null,
	};
	return resumeKey(inputs);
}

// Task, trial, model order with seeded-shuffled conditions, so an interruption leaves complete pairs.
export async function runMatrix(o: MatrixOptions): Promise<MatrixSummary> {
	const log = o.log ?? (() => {});
	const maxAttempts = o.maxAttempts ?? 3;
	const gh = graderHash();
	const summary: MatrixSummary = {
		ran: 0,
		skipped: 0,
		infraFailed: 0,
		pending: 0,
	};

	for (const task of o.tasks) {
		for (let trial = 1; trial <= o.trials; trial++) {
			for (const model of o.models) {
				for (const cond of shuffled(
					o.conditions,
					`${model.id}|${task.id}|${trial}`,
				)) {
					if (summary.stoppedBy) {
						summary.pending++;
						continue;
					}
					if (o.shouldStop?.()) {
						summary.stoppedBy = "interrupt";
						summary.pending++;
						continue;
					}
					const ref = {
						split: task.split,
						model: model.id,
						condition: cond.name,
						taskId: task.id,
						trial,
					} as const;
					const key = keyFor(o, model, cond, task, gh);
					const prior = o.store.read(ref);
					if (
						prior &&
						prior.key === key &&
						(prior.status === "done" ||
							(prior.status === "infra_failed" &&
								prior.attempts >= maxAttempts))
					) {
						summary.skipped++;
						continue;
					}
					let attempts = prior && prior.key === key ? prior.attempts : 0;
					for (;;) {
						attempts++;
						const base: CellRecord = {
							id: `${model.id}/${cond.name}/${task.id}/t${trial}`,
							key,
							status: "running",
							...ref,
							model: model.id,
							category: task.category,
							attempts,
							sha: cond.sha,
						};
						o.store.write(base);
						const r = await executeCell({
							provider: model.provider,
							task,
							trial,
							condition: cond.name,
							server: cond.server,
							profile: o.profile,
						});
						if (r.rateLimited) {
							// A 429 is not a result: restore the prior record so the cell stays pending.
							if (prior) o.store.write(prior);
							else o.store.remove(ref);
							summary.stoppedBy = "rate_limit";
							summary.pending++;
							log(`429 from provider: stopping the matrix at ${base.id}`);
							break;
						}
						const finished: CellRecord = {
							...base,
							...r.cell,
							finishedAt: new Date().toISOString(),
						};
						o.store.write(finished);
						if (finished.status === "infra_failed") {
							log(
								`infra failure (${attempts}/${maxAttempts}) ${base.id}: ${finished.infraDetail}`,
							);
							if (attempts < maxAttempts) continue;
							summary.infraFailed++;
							break;
						}
						summary.ran++;
						log(`${base.id} -> ${finished.outcome}`);
						break;
					}
				}
			}
		}
	}
	return summary;
}
