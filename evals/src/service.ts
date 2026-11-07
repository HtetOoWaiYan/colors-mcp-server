import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".config", "local-inference");
export const BASE_URL = "http://127.0.0.1:8317";

export function loadApiKey(): string {
	if (process.env.LOCAL_INFERENCE_API_KEY)
		return process.env.LOCAL_INFERENCE_API_KEY;
	const text = readFileSync(join(DIR, ".env"), "utf8");
	const m = /^LOCAL_INFERENCE_API_KEY=(.*)$/m.exec(text);
	if (!m)
		throw new Error(
			"LOCAL_INFERENCE_API_KEY not found in ~/.config/local-inference/.env",
		);
	return (m[1] as string).trim().replace(/^["']|["']$/g, "");
}

function isActive(): boolean {
	try {
		return (
			execFileSync(join(DIR, "status"), { encoding: "utf8" })
				.split("\n")[0]
				?.trim() === "active"
		);
	} catch {
		return false;
	}
}

// Never stop a service the user already had running.
export function ensureService(): { startedByUs: boolean; stop(): void } {
	if (isActive()) return { startedByUs: false, stop() {} };
	execFileSync(join(DIR, "start"), { stdio: "ignore" });
	return {
		startedByUs: true,
		stop() {
			try {
				execFileSync(join(DIR, "stop"), { stdio: "ignore" });
			} catch {
				/* best effort */
			}
		},
	};
}
