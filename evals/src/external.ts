import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { EVALS_ROOT } from "./identity.js";
import { sha256 } from "./record.js";
import type { ServerSpec } from "./runner/mcp-bridge.js";

export type ExternalEntry =
	| {
			id: string;
			kind: "npm";
			package: string;
			version: string;
			bin: string;
			note?: string;
	  }
	| {
			id: string;
			kind: "git";
			url: string;
			commit: string;
			build: string[];
			entry: string;
			note?: string;
	  };

export interface ExternalBuild {
	id: string;
	/** Stands in for the git SHA in run identity: pinned package version or commit. */
	pin: string;
	spec: ServerSpec;
	lockHash: string;
}

export function loadRegistry(): ExternalEntry[] {
	return JSON.parse(
		readFileSync(join(EVALS_ROOT, "external-servers.json"), "utf8"),
	) as ExternalEntry[];
}

const run = (cmd: string, args: string[], cwd: string) =>
	execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

// Installs a pinned third-party server under .cache/ with install scripts disabled, and returns a
// spec that starts it with a minimal environment (no inherited secrets, a private HOME).
export function prepareExternalServer(id: string): ExternalBuild {
	const entry = loadRegistry().find((e) => e.id === id);
	if (!entry)
		throw new Error(
			`unknown external server ${id}; known: ${loadRegistry()
				.map((e) => e.id)
				.join(", ")}`,
		);
	const dir = join(EVALS_ROOT, ".cache", "external", id);
	mkdirSync(join(dir, ".home"), { recursive: true });
	let pin: string;
	let command: string;
	let args: string[];
	let lockDir = dir;
	if (entry.kind === "npm") {
		pin = `${entry.package}@${entry.version}`;
		if (!existsSync(join(dir, "package.json")))
			writeFileSync(
				join(dir, "package.json"),
				JSON.stringify({ name: `eval-${id}`, private: true }),
			);
		if (!existsSync(join(dir, "node_modules", entry.package)))
			run(
				"npm",
				["install", "--ignore-scripts", "--save-exact", "--no-audit", "--no-fund", pin],
				dir,
			);
		command = join(dir, "node_modules", ".bin", entry.bin);
		args = [];
	} else {
		pin = entry.commit;
		lockDir = join(dir, "src");
		if (!existsSync(lockDir)) {
			run("git", ["clone", "-q", entry.url, lockDir], dir);
			run("git", ["checkout", "-q", entry.commit], lockDir);
			run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], lockDir);
			try {
				// tsc exits non-zero on type errors but still emits; the entry check below decides.
				run(join(lockDir, entry.build[0] as string), entry.build.slice(1), lockDir);
			} catch {
				/* emitted output is checked next */
			}
		}
		if (run("git", ["rev-parse", "HEAD"], lockDir) !== entry.commit)
			throw new Error(`${lockDir} is not at ${entry.commit}`);
		if (!existsSync(join(lockDir, entry.entry)))
			throw new Error(`build produced no ${entry.entry} in ${lockDir}`);
		command = process.execPath;
		args = [join(lockDir, entry.entry)];
	}
	return {
		id,
		pin,
		lockHash: sha256(readFileSync(join(lockDir, "package-lock.json"), "utf8")),
		spec: {
			command,
			args,
			cwd: dir,
			isolateEnv: true,
			env: { HOME: join(dir, ".home") },
		},
	};
}
