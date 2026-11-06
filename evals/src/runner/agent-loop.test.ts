import { describe, expect, it } from "vitest";
import { LIMITS, runAgent } from "./agent-loop.js";
import {
	type Provider,
	ProviderError,
	type ToolCallOutcome,
	type ToolHost,
	ToolHostCrash,
	type TurnResult,
} from "./types.js";

const turn = (p: Partial<TurnResult>): TurnResult => ({
	text: "",
	toolCalls: [],
	stop: "end",
	inputTokens: 10,
	outputTokens: 5,
	model: "fake-model-1",
	...p,
});

function scripted(
	turns: (TurnResult | Error)[],
): Provider & { seen: unknown[] } {
	const seen: unknown[] = [];
	let i = 0;
	return {
		id: "fake",
		seen,
		async chat(req) {
			seen.push(JSON.parse(JSON.stringify(req.messages)));
			const t = turns[Math.min(i++, turns.length - 1)] as TurnResult | Error;
			if (t instanceof Error) throw t;
			return t;
		},
	};
}

const host = (
	impl: (
		name: string,
		args: unknown,
	) => Partial<ToolCallOutcome> | Promise<Partial<ToolCallOutcome>>,
): ToolHost => ({
	tools: [{ name: "t", description: "", inputSchema: { type: "object" } }],
	async call(name, args) {
		return {
			text: "ok",
			isError: false,
			schemaRejection: false,
			timedOut: false,
			...(await impl(name, args)),
		};
	},
	async close() {},
});

describe("agent loop", () => {
	it("returns the final text and token totals with no tools", async () => {
		const run = await runAgent({
			provider: scripted([turn({ text: "done" })]),
			prompt: "hi",
		});
		expect(run.end).toBe("answered");
		expect(run.finalText).toBe("done");
		expect(run.turns).toBe(1);
		expect(run.inputTokens).toBe(10);
		expect(run.modelReturned).toBe("fake-model-1");
	});

	it("runs several tool calls in one turn, preserving ids and order", async () => {
		const calls = [
			{ id: "a", name: "t", args: { x: 1 } },
			{ id: "b", name: "t", args: { x: 2 } },
		];
		const p = scripted([
			turn({ toolCalls: calls, stop: "tool_use" }),
			turn({ text: "final" }),
		]);
		const run = await runAgent({
			provider: p,
			prompt: "q",
			host: host((_n, a) => ({ text: `r${(a as { x: number }).x}` })),
		});
		expect(run.end).toBe("answered");
		expect(run.toolCalls.map((c) => c.text)).toEqual(["r1", "r2"]);
		const second = p.seen[1] as { role: string; results?: { id: string }[] }[];
		expect(second.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
		expect(second[2]?.results?.map((r) => r.id)).toEqual(["a", "b"]);
	});

	it("reports malformed JSON arguments back to the model without calling the server", async () => {
		let called = 0;
		const p = scripted([
			turn({
				toolCalls: [
					{ id: "a", name: "t", args: "{bad", argsError: "Unexpected token" },
				],
				stop: "tool_use",
			}),
			turn({ text: "ok" }),
		]);
		const run = await runAgent({
			provider: p,
			prompt: "q",
			host: host(() => {
				called++;
				return {};
			}),
		});
		expect(called).toBe(0);
		expect(run.toolCalls[0]?.isError).toBe(true);
		expect(run.toolErrorCount).toBe(1);
	});

	it("counts tool errors and schema rejections, and detects recovery", async () => {
		let n = 0;
		const call = (id: string) => ({ id, name: "t", args: {} });
		const p = scripted([
			turn({ toolCalls: [call("1")], stop: "tool_use" }),
			turn({ toolCalls: [call("2")], stop: "tool_use" }),
			turn({ text: "fine" }),
		]);
		const run = await runAgent({
			provider: p,
			prompt: "q",
			host: host(() =>
				n++ === 0
					? { isError: true, schemaRejection: true, text: "MCP error -32602" }
					: {},
			),
		});
		expect(run.toolErrorCount).toBe(1);
		expect(run.schemaRejectionCount).toBe(1);
		expect(run.recoveredToolError).toBe(true);
	});

	it("truncates oversized tool results", async () => {
		const p = scripted([
			turn({ toolCalls: [{ id: "1", name: "t", args: {} }], stop: "tool_use" }),
			turn({ text: "x" }),
		]);
		const run = await runAgent({
			provider: p,
			prompt: "q",
			host: host(() => ({ text: "y".repeat(LIMITS.toolResultChars + 10) })),
		});
		expect(run.toolCalls[0]?.truncated).toBe(true);
		expect(run.toolCalls[0]?.text.length).toBeLessThan(
			LIMITS.toolResultChars + 50,
		);
	});

	it("ends with limit_exhausted at the turn limit", async () => {
		const p = scripted([
			turn({ toolCalls: [{ id: "1", name: "t", args: {} }], stop: "tool_use" }),
		]);
		const run = await runAgent({
			provider: p,
			prompt: "q",
			host: host(() => ({})),
			limits: { maxTurns: 3 },
		});
		expect(run.end).toBe("limit_exhausted");
		expect(run.endDetail).toBe("turn limit");
	});

	it("ends with limit_exhausted at the tool-call limit", async () => {
		const many = Array.from({ length: 3 }, (_, i) => ({
			id: String(i),
			name: "t",
			args: {},
		}));
		const p = scripted([turn({ toolCalls: many, stop: "tool_use" })]);
		const run = await runAgent({
			provider: p,
			prompt: "q",
			host: host(() => ({})),
			limits: { maxToolCalls: 5 },
		});
		expect(run.end).toBe("limit_exhausted");
		expect(run.endDetail).toBe("tool-call limit");
	});

	it("records token truncation on the final answer", async () => {
		const run = await runAgent({
			provider: scripted([turn({ text: "partial", stop: "length" })]),
			prompt: "q",
		});
		expect(run.end).toBe("answered");
		expect(run.truncation).toBe(true);
	});

	it("maps provider errors: 429 -> rate_limited, 5xx -> infra_failed", async () => {
		const a = await runAgent({
			provider: scripted([new ProviderError("rate_limit", "429")]),
			prompt: "q",
		});
		expect(a.end).toBe("rate_limited");
		const b = await runAgent({
			provider: scripted([new ProviderError("infra", "503")]),
			prompt: "q",
		});
		expect(b.end).toBe("infra_failed");
	});

	it("maps a tool server crash to infra_failed", async () => {
		const p = scripted([
			turn({ toolCalls: [{ id: "1", name: "t", args: {} }], stop: "tool_use" }),
		]);
		const h = host(() => {
			throw new ToolHostCrash("boom");
		});
		const run = await runAgent({ provider: p, prompt: "q", host: h });
		expect(run.end).toBe("infra_failed");
	});

	it("ends with limit_exhausted when the run deadline passes, even mid-request", async () => {
		const slow: Provider = {
			id: "slow",
			chat: (req) =>
				new Promise((_res, rej) =>
					req.signal?.addEventListener("abort", () =>
						rej(new Error("aborted")),
					),
				),
		};
		const run = await runAgent({
			provider: slow,
			prompt: "q",
			limits: { runDeadlineMs: 50 },
		});
		expect(run.end).toBe("limit_exhausted");
		expect(run.endDetail).toBe("run deadline");
	});
});
