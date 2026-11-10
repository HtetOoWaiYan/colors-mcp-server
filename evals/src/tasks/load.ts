import { readFileSync } from "node:fs";
import { graderHashFor } from "../identity.js";
import { MANIFEST_PATH, manifestFor, SUITE_PATH } from "./build-suite.js";
import { MANIFEST_FRESH_PATH, SUITE_FRESH_PATH } from "./fresh/build-fresh.js";
import { MANIFEST_GEN_PATH, SUITE_GEN_PATH } from "./gen/build-gen.js";
import {
	MANIFEST_NEUTRAL_PATH,
	SUITE_NEUTRAL_PATH,
} from "./neutral/build-neutral.js";
import type { Task } from "./types.js";

export interface Manifest {
	version: number;
	suiteHash: string;
	taskCount: number;
	tasks: Record<string, string>;
}

export type SuiteName = "v1" | "generalization" | "fresh" | "neutral";

interface SuiteDef {
	suitePath: string;
	manifestPath: string;
	/** Source directories whose hash is part of every resume key for this suite. */
	graderDirs: string[];
	/** Whether the suite has a sealed held-out split; the generalization suite is dev-only by design. */
	heldout: boolean;
	/** Every task is held out: runs refuse task subsets and reports show only whole-suite aggregates. */
	sealedOnly: boolean;
}

const SUITES: Record<SuiteName, SuiteDef> = {
	v1: {
		suitePath: SUITE_PATH,
		manifestPath: MANIFEST_PATH,
		graderDirs: ["graders", "reference"],
		heldout: true,
		sealedOnly: false,
	},
	generalization: {
		suitePath: SUITE_GEN_PATH,
		manifestPath: MANIFEST_GEN_PATH,
		graderDirs: ["graders", "reference", "graders-gen", "reference-gen"],
		heldout: false,
		sealedOnly: false,
	},
	fresh: {
		suitePath: SUITE_FRESH_PATH,
		manifestPath: MANIFEST_FRESH_PATH,
		graderDirs: [
			"graders",
			"reference",
			"graders-gen",
			"reference-gen",
			"graders-fresh",
			"reference-fresh",
		],
		heldout: true,
		sealedOnly: true,
	},
	// Written blind to every server's tools and frozen before any server ran on it; dev-only so per-category results are visible.
	neutral: {
		suitePath: SUITE_NEUTRAL_PATH,
		manifestPath: MANIFEST_NEUTRAL_PATH,
		graderDirs: ["graders", "reference", "graders-neutral", "reference-neutral"],
		heldout: false,
		sealedOnly: false,
	},
};

export function parseSuiteName(s: string | undefined): SuiteName {
	const name = s ?? "v1";
	if (!(name in SUITES))
		throw new Error(
			`unknown suite ${name}; known: ${Object.keys(SUITES).join(", ")}`,
		);
	return name as SuiteName;
}

export function loadSuite(name: SuiteName = "v1"): {
	name: SuiteName;
	tasks: Task[];
	manifest: Manifest;
	graderHash: string;
	heldout: boolean;
	sealedOnly: boolean;
} {
	const def = SUITES[name];
	const tasks = JSON.parse(readFileSync(def.suitePath, "utf8")) as Task[];
	const manifest = JSON.parse(
		readFileSync(def.manifestPath, "utf8"),
	) as Manifest;
	const actual = manifestFor(tasks, manifest.version);
	if (actual.suiteHash !== manifest.suiteHash) {
		throw new Error(
			`${name} suite JSON does not match its manifest (the frozen suite was modified)`,
		);
	}
	return {
		name,
		tasks,
		manifest,
		graderHash: graderHashFor(def.graderDirs),
		heldout: def.heldout,
		sealedOnly: def.sealedOnly,
	};
}
