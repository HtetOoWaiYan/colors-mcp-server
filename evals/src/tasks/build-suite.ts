// A frozen suite version is never rewritten silently: a differing manifest hash needs `--bump`.
// `fix-cache.json` caches the slow contrast-fix search, keyed by its inputs.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cat1, cat2, cat3 } from "./build/cat01-03.js";
import { cat4, cat5, cat6, cat7 } from "./build/cat04-07.js";
import { cat8, cat9, cat10, cat11 } from "./build/cat08-11.js";
import { cat12, cat13, cat14 } from "./build/cat12-14.js";
import type { Task } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SUITE_PATH = join(here, "suite.json");
export const MANIFEST_PATH = join(here, "manifest.json");
const CACHE_PATH = join(here, "fix-cache.json");

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function buildAll(): Task[] {
	const cache: Record<string, { dStar: number; witness: string }> = existsSync(
		CACHE_PATH,
	)
		? JSON.parse(readFileSync(CACHE_PATH, "utf8"))
		: {};
	const tasks = [
		...cat1(),
		...cat2(),
		...cat3(),
		...cat4(cache),
		...cat5(),
		...cat6(),
		...cat7(),
		...cat8(),
		...cat9(),
		...cat10(),
		...cat11(),
		...cat12(),
		...cat13(cache),
		...cat14(),
	];
	writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, "\t")}\n`);
	return tasks;
}

export function manifestFor(tasks: Task[], version: number) {
	const hashes = Object.fromEntries(
		tasks.map((t) => [t.id, sha(JSON.stringify(t))]),
	);
	return {
		version,
		suiteHash: sha(JSON.stringify(hashes)),
		taskCount: tasks.length,
		tasks: hashes,
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tasks = buildAll();
	const bump = process.argv.includes("--bump");
	let version = 1;
	if (existsSync(MANIFEST_PATH)) {
		const old = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
		const next = manifestFor(tasks, old.version);
		if (next.suiteHash !== old.suiteHash) {
			if (!bump) {
				console.error(
					"Suite content changed. Existing suite versions are frozen; re-run with --bump to create a new version.",
				);
				process.exit(1);
			}
			version = old.version + 1;
		} else version = old.version;
	}
	writeFileSync(SUITE_PATH, `${JSON.stringify(tasks, null, "\t")}\n`);
	writeFileSync(
		MANIFEST_PATH,
		`${JSON.stringify(manifestFor(tasks, version), null, "\t")}\n`,
	);
	console.log(`suite v${version}: ${tasks.length} tasks`);
}
