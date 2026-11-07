// Fresh suite: the sealed final judge, written from designer briefs without sight of the tools or of any results.
// Frozen like the other suites: a differing manifest hash needs `--bump`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestFor } from "../build-suite.js";
import type { Task } from "../types.js";
import {
	cat201,
	cat202,
	cat203,
	cat204,
	cat205,
	cat206,
	cat207,
	cat208,
} from "./cats-fresh.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SUITE_FRESH_PATH = join(here, "suite-fresh.json");
export const MANIFEST_FRESH_PATH = join(here, "manifest-fresh.json");
export const FRESH_SUITE_NAME = "fresh";

export function buildAllFresh(): Task[] {
	return [
		...cat201(),
		...cat202(),
		...cat203(),
		...cat204(),
		...cat205(),
		...cat206(),
		...cat207(),
		...cat208(),
	];
}

export const freshManifestFor = (tasks: Task[], version: number) => ({
	suite: FRESH_SUITE_NAME,
	...manifestFor(tasks, version),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tasks = buildAllFresh();
	let version = 1;
	if (existsSync(MANIFEST_FRESH_PATH)) {
		const old = JSON.parse(readFileSync(MANIFEST_FRESH_PATH, "utf8"));
		if (freshManifestFor(tasks, old.version).suiteHash !== old.suiteHash) {
			if (!process.argv.includes("--bump")) {
				console.error(
					"Fresh suite content changed. Suite versions are frozen; re-run with --bump to create a new version.",
				);
				process.exit(1);
			}
			version = old.version + 1;
		} else version = old.version;
	}
	writeFileSync(SUITE_FRESH_PATH, `${JSON.stringify(tasks, null, "\t")}\n`);
	const manifest = freshManifestFor(tasks, version);
	writeFileSync(MANIFEST_FRESH_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
	// Counts and the hash only: printing task-level results would unseal the suite.
	console.log(`fresh suite v${version}: ${tasks.length} tasks, suite hash ${manifest.suiteHash}`);
}
