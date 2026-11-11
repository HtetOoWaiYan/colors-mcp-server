import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { prepareExternalServer } from "./external.js";
import { EVALS_ROOT, prepareServerBuild } from "./identity.js";
import { type ConditionSpec, type ModelSpec, runMatrix } from "./matrix.js";
import { formatOracle, runOracle } from "./oracle.js";
import {
	BASELINE_CASES,
	preflightProvider,
	preflightServer,
	V2_CASES,
} from "./preflight.js";
import { ResultStore, sha256, spendHoldout } from "./record.js";
import {
	computeReport,
	computeSealedReport,
	renderMarkdown,
	renderSealedMarkdown,
} from "./report.js";
import { connectServer } from "./runner/mcp-bridge.js";
import { anthropicProvider } from "./runner/providers/anthropic.js";
import { openAiProvider } from "./runner/providers/openai.js";
import { BASE_URL, ensureService, loadApiKey } from "./service.js";
import { loadSuite, parseSuiteName, type SuiteName } from "./tasks/load.js";

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

// Runs written before suites existed carry no `suite` field and are v1.
function runSuite(runId: string): SuiteName | undefined {
	const p = join(results, runId, "manifest.json");
	if (!existsSync(p)) return undefined;
	return parseSuiteName(JSON.parse(readFileSync(p, "utf8")).suite);
}

async function preflight(): Promise<number> {
	const ref = flag("server-ref", "main") as string;
	// Fails before any model call if the frozen suite JSON no longer matches its manifest.
	const suite = loadSuite(parseSuiteName(flag("suite")));
	console.log(
		`suite ${suite.name} v${suite.manifest.version}: ${suite.tasks.length} tasks, manifest ok, grader hash ${suite.graderHash.slice(0, 12)}`,
	);
	const service = ensureService();
	let failed = 0;
	try {
		const build = prepareServerBuild(ref);
		console.log(`server ${ref} -> ${build.sha}`);
		const v2 = flag("cases", "baseline") === "v2";
		const s = await preflightServer(
			build.spec,
			v2 ? V2_CASES : BASELINE_CASES,
			v2 ? null : 11,
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
	const suite = loadSuite(parseSuiteName(flag("suite")));
	const { tasks: allTasks, manifest } = suite;
	const existing = runSuite(runId);
	if (existing && existing !== suite.name)
		throw new Error(
			`run ${runId} belongs to suite ${existing}; use a new --run-id for suite ${suite.name}`,
		);
	let tasks = allTasks;
	const only = flag("tasks");
	const limit = flag("limit");
	if (suite.sealedOnly && (only || limit))
		// An aggregate over a hand-picked subset of a sealed suite is a per-task result.
		throw new Error(
			`suite ${suite.name} is sealed: --tasks and --limit are refused; run the whole suite`,
		);
	if (only) tasks = tasks.filter((t) => only.split(",").includes(t.id));
	if (limit) tasks = tasks.slice(0, Number(limit));
	const profile = flag("profile", "tni") as "tni" | "instructions";
	const store = new ResultStore(results, sealed, runId);
	const reuse = flag("reuse-from");
	if (reuse) {
		const from = runSuite(reuse);
		if (from !== suite.name)
			throw new Error(
				`--reuse-from ${reuse} is suite ${from ?? "unknown"}, not ${suite.name}`,
			);
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
	// `--server-id` benchmarks a pinned third-party server from external-servers.json instead of a ref of this repo.
	const externalId = flag("server-id");
	const external = externalId ? prepareExternalServer(externalId) : undefined;
	const build = external
		? {
				sha: external.pin,
				spec: external.spec,
				lockHash: external.lockHash,
			}
		: prepareServerBuild(ref);
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
	const serverName = external
		? `${external.id}${profile === "instructions" ? "+instr" : ""}`
		: `server@${build.sha.slice(0, 8)}${profile === "instructions" ? "+instr" : ""}`;
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
		serverRef: external ? `external:${external.id}` : ref,
		serverSha: build.sha,
		serverLabel: serverName,
		protocolVersion,
		toolDefsHash,
		lockHash: build.lockHash,
		node: process.version,
		graderHash: suite.graderHash,
		suite: suite.name,
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
			graderHash: suite.graderHash,
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
			suite.name,
		);
		const complete =
			summary.pending === 0 && !summary.stoppedBy && !only && !limit;
		// Benchmarking someone else's server tunes nothing, so it does not spend a held-out evaluation.
		spendHoldout(results, suite.heldout, complete && !external, {
			runId,
			suite: suite.name,
			serverSha: build.sha,
			profile,
			at: new Date().toISOString(),
		});
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
	suiteName: SuiteName,
): Promise<void> {
	const { tasks, manifest, heldout, sealedOnly } = loadSuite(suiteName);
	const store = new ResultStore(results, sealed, runId);
	const args = {
		runId,
		suite: { name: suiteName, heldout, sealedOnly },
		suiteVersion: manifest.version,
		tasks,
		cells: store.all(true),
		models,
		conditions: ["no-tools", serverName],
		serverCondition: serverName,
	};
	const meta = { serverSha: sha, nodeVersion: process.version };
	// A sealed-only suite writes only the cut-down report, so nothing per task reaches results/.
	const [json, md] = sealedOnly
		? (() => {
				const r = computeSealedReport(args);
				return [r, renderSealedMarkdown(r, meta)] as const;
			})()
		: (() => {
				const r = computeReport(args);
				return [r, renderMarkdown(r, meta)] as const;
			})();
	mkdirSync(join(results, runId), { recursive: true });
	writeFileSync(
		join(results, runId, "results.json"),
		`${JSON.stringify(json, null, "\t")}\n`,
	);
	writeFileSync(join(results, runId, "report.md"), md);
	console.log(`wrote ${join(results, runId, "report.md")}`);
}

async function report(): Promise<number> {
	const runId = flag("run-id") as string;
	const mPath = join(results, runId, "manifest.json");
	if (!existsSync(mPath)) throw new Error(`no manifest for run ${runId}`);
	const m = JSON.parse(readFileSync(mPath, "utf8"));
	const suite = parseSuiteName(m.suite);
	const asked = flag("suite");
	if (asked && parseSuiteName(asked) !== suite)
		throw new Error(`run ${runId} is suite ${suite}, not ${asked}`);
	await writeReport(
		runId,
		m.serverSha,
		`server@${String(m.serverSha).slice(0, 8)}${m.clientProfile === "instructions" ? "+instr" : ""}`,
		m.models.map((x: { id: string }) => x.id),
		suite,
	);
	return 0;
}

async function oracle(): Promise<number> {
	const suite = parseSuiteName(flag("suite"));
	if (suite === "fresh") {
		console.error(
			"oracle: suite fresh has no tool solver by design. It was written without sight of the tools, so there is no tool call to replay, and a per-task oracle over a sealed suite would expose held-out results. Its witnesses and invalid answers are checked by npm test.",
		);
		return 64;
	}
	if (suite !== "v1") {
		// Its tasks were written from briefs, not around the tools, so there is no "right tool call" to replay.
		console.error(
			`oracle: suite ${suite} has no tool-path oracle by design; its witnesses are checked by npm test`,
		);
		return 64;
	}
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
		"usage: cli <preflight|run|report|oracle> [--suite v1|generalization|fresh|neutral|neutral2] [--server-ref main | --server-id coolors-mcp] [--run-id ID] [--models haiku-5-5,gpt-6-luna] [--trials 2] [--tasks c01-1,...] [--limit N]",
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
