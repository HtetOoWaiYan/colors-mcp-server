import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { EVALS_ROOT, graderHash, prepareServerBuild } from "./identity.js";
import { type ConditionSpec, type ModelSpec, runMatrix } from "./matrix.js";
import { formatOracle, runOracle } from "./oracle.js";
import {
	BASELINE_CASES,
	preflightProvider,
	preflightServer,
	V2_CASES,
} from "./preflight.js";
import { ResultStore, sha256 } from "./record.js";
import { computeReport, renderMarkdown } from "./report.js";
import { connectServer } from "./runner/mcp-bridge.js";
import { anthropicProvider } from "./runner/providers/anthropic.js";
import { openAiProvider } from "./runner/providers/openai.js";
import { BASE_URL, ensureService, loadApiKey } from "./service.js";
import { loadSuite } from "./tasks/load.js";

const MODELS = {
	"haiku-5-5": { modelName: "claude-haiku-5-5", api: "anthropic" },
	"gpt-6-luna": { modelName: "gpt-6-luna", api: "openai" },
} as const;

function flag(name: string, fallback?: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : fallback;
}

function buildModels(ids: string[]): ModelSpec[] {
	const apiKey = loadApiKey();
	return ids.map((id) => {
		const m = MODELS[id as keyof typeof MODELS];
		if (!m)
			throw new Error(
				`unknown model ${id}; known: ${Object.keys(MODELS).join(", ")}`,
			);
		const opts = { id, model: m.modelName, baseUrl: BASE_URL, apiKey };
		return {
			id,
			modelName: m.modelName,
			provider:
				m.api === "anthropic" ? anthropicProvider(opts) : openAiProvider(opts),
		};
	});
}

const modelIds = () =>
	(flag("models", "haiku-5-5,gpt-6-luna") as string).split(",");
const results = join(EVALS_ROOT, "results");
const sealed = join(EVALS_ROOT, "sealed");

async function preflight(): Promise<number> {
	const ref = flag("server-ref", "main") as string;
	const service = ensureService();
	let failed = 0;
	try {
		const build = prepareServerBuild(ref);
		console.log(`server ${ref} -> ${build.sha}`);
		const v2 = flag("cases", "baseline") === "v2";
		const s = await preflightServer(
			build.spec,
			v2 ? V2_CASES : BASELINE_CASES,
			11,
		);
		const providers = buildModels(modelIds());
		const all = [...s.results];
		for (const m of providers)
			all.push(...(await preflightProvider(m.provider)));
		for (const r of all) {
			console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
			if (!r.ok) failed++;
		}
	} finally {
		service.stop();
	}
	console.log(
		failed === 0 ? "\npreflight passed" : `\npreflight FAILED (${failed})`,
	);
	return failed === 0 ? 0 : 1;
}

async function run(): Promise<number> {
	const runId = flag("run-id") as string;
	if (!runId) throw new Error("--run-id is required");
	const ref = flag("server-ref", "main") as string;
	const trials = Number(flag("trials", "2"));
	const { tasks: allTasks, manifest } = loadSuite();
	let tasks = allTasks;
	const only = flag("tasks");
	if (only) tasks = tasks.filter((t) => only.split(",").includes(t.id));
	const limit = flag("limit");
	if (limit) tasks = tasks.slice(0, Number(limit));
	const profile = flag("profile", "tni") as "tni" | "instructions";
	const store = new ResultStore(results, sealed, runId);
	const reuse = flag("reuse-from");
	if (reuse) {
		const n = store.importCondition(
			new ResultStore(results, sealed, reuse),
			"no-tools",
		);
		console.log(
			`reused ${n} finished no-tools cell(s) from run ${reuse} (re-run if their inputs changed)`,
		);
	}
	const reset = store.resetRunning();
	if (reset) console.log(`returned ${reset} interrupted cell(s) to pending`);

	const service = ensureService();
	const build = prepareServerBuild(ref);
	const probe = await connectServer(build.spec);
	const toolDefsHash = sha256(
		JSON.stringify({
			tools: probe.tools,
			instructions:
				profile === "instructions" ? (probe.instructions ?? null) : null,
		}),
	);
	const protocolVersion = probe.protocolVersion;
	await probe.close();
	const serverName = `server@${build.sha.slice(0, 8)}${profile === "instructions" ? "+instr" : ""}`;
	const conditions: ConditionSpec[] = [
		{ name: "no-tools" },
		{
			name: serverName,
			server: build.spec,
			sha: build.sha,
			toolDefsHash,
			lockHash: build.lockHash,
		},
	];
	const models = buildModels(modelIds());
	store.writeManifest({
		runId,
		serverRef: ref,
		serverSha: build.sha,
		protocolVersion,
		toolDefsHash,
		lockHash: build.lockHash,
		node: process.version,
		graderHash: graderHash(),
		suiteVersion: manifest.version,
		suiteHash: manifest.suiteHash,
		models: models.map((m) => ({ id: m.id, name: m.modelName })),
		trials,
		clientProfile: profile,
		serverInstructions: probe.instructions ?? null,
		startedAt: new Date().toISOString(),
	});

	let stop = false;
	process.on("SIGINT", () => {
		if (stop) {
			store.resetRunning();
			service.stop();
			process.exit(130);
		}
		stop = true;
		console.log(
			"\ninterrupt: finishing the current cell, then stopping (press again to exit now)",
		);
	});
	try {
		const summary = await runMatrix({
			store,
			models,
			conditions,
			tasks,
			taskHashes: manifest.tasks,
			trials,
			profile,
			log: (l) => console.log(l),
			shouldStop: () => stop,
		});
		console.log(JSON.stringify(summary));
		await writeReport(
			runId,
			build.sha,
			serverName,
			models.map((m) => m.id),
		);
		if (summary.pending === 0 && !summary.stoppedBy && !only && !limit) {
			// A completed matrix spends one held-out evaluation (sealed-set policy).
			appendFileSync(
				join(results, "holdout-log.jsonl"),
				`${JSON.stringify({ runId, serverSha: build.sha, profile, at: new Date().toISOString() })}\n`,
			);
		}
		return summary.stoppedBy === "rate_limit" ? 2 : 0;
	} finally {
		store.resetRunning();
		service.stop();
	}
}

async function writeReport(
	runId: string,
	sha: string | undefined,
	serverName: string,
	models: string[],
): Promise<void> {
	const { tasks, manifest } = loadSuite();
	const store = new ResultStore(results, sealed, runId);
	const report = computeReport({
		runId,
		suiteVersion: manifest.version,
		tasks,
		cells: store.all(true),
		models,
		conditions: ["no-tools", serverName],
		serverCondition: serverName,
	});
	mkdirSync(join(results, runId), { recursive: true });
	writeFileSync(
		join(results, runId, "results.json"),
		`${JSON.stringify(report, null, "\t")}\n`,
	);
	writeFileSync(
		join(results, runId, "report.md"),
		renderMarkdown(report, { serverSha: sha, nodeVersion: process.version }),
	);
	console.log(`wrote ${join(results, runId, "report.md")}`);
}

async function report(): Promise<number> {
	const runId = flag("run-id") as string;
	const mPath = join(results, runId, "manifest.json");
	if (!existsSync(mPath)) throw new Error(`no manifest for run ${runId}`);
	const m = JSON.parse(readFileSync(mPath, "utf8"));
	await writeReport(
		runId,
		m.serverSha,
		`server@${String(m.serverSha).slice(0, 8)}${m.clientProfile === "instructions" ? "+instr" : ""}`,
		m.models.map((x: { id: string }) => x.id),
	);
	return 0;
}

async function oracle(): Promise<number> {
	const build = prepareServerBuild(
		flag("server-ref", "working-tree") as string,
	);
	console.log(`oracle against ${build.sha}`);
	const r = await runOracle(build.spec);
	console.log(formatOracle(r));
	return Object.values(r.byCategory).every(
		(c) => c.dev.every((d) => d.pass) && c.heldoutPassed === c.heldoutTotal,
	)
		? 0
		: 1;
}

const cmd = process.argv[2];
const table: Record<string, () => Promise<number>> = {
	preflight,
	run,
	report,
	oracle,
};
if (!cmd || !table[cmd]) {
	console.error(
		"usage: cli <preflight|run|report> [--server-ref main] [--run-id ID] [--models haiku-5-5,gpt-6-luna] [--trials 2] [--tasks c01-1,...] [--limit N]",
	);
	process.exit(64);
}
(table[cmd] as () => Promise<number>)().then(
	(code) => process.exit(code),
	(e) => {
		console.error(e);
		process.exit(1);
	},
);
