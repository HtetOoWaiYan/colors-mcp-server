import {
	type Msg,
	type Provider,
	ProviderError,
	type ToolCall,
	type ToolHost,
	ToolHostCrash,
	type ToolResult,
} from "./types.js";

export const LIMITS = {
	maxTurns: 12,
	maxToolCalls: 20,
	maxOutputTokens: 4096,
	toolResultChars: 25_000,
	runDeadlineMs: 180_000,
	toolTimeoutMs: 30_000,
} as const;

export type Limits = { -readonly [K in keyof typeof LIMITS]: number };

export const SYSTEM_PROMPT =
	"You are a design assistant helping with color work for user interfaces and data visualization. Use any available tools when they help. When you are finished, reply with the final answer in the exact format the user asks for.";

export interface ToolCallRecord {
	name: string;
	args: unknown;
	text: string;
	isError: boolean;
	schemaRejection: boolean;
	timedOut: boolean;
	truncated: boolean;
}

export interface AgentRun {
	end: "answered" | "limit_exhausted" | "infra_failed" | "rate_limited";
	endDetail?: string;
	finalText: string;
	transcript: Msg[];
	toolCalls: ToolCallRecord[];
	turns: number;
	inputTokens: number;
	outputTokens: number;
	elapsedMs: number;
	truncation: boolean;
	modelReturned: string;
	protocolVersion?: string;
	schemaRejectionCount: number;
	toolErrorCount: number;
	recoveredToolError: boolean;
}

export async function runAgent(args: {
	provider: Provider;
	prompt: string;
	host?: ToolHost;
	system?: string;
	limits?: Partial<Limits>;
}): Promise<AgentRun> {
	const limits: Limits = { ...LIMITS, ...args.limits };
	const started = Date.now();
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), limits.runDeadlineMs);
	const transcript: Msg[] = [{ role: "user", text: args.prompt }];
	const records: ToolCallRecord[] = [];
	const run: AgentRun = {
		end: "answered",
		finalText: "",
		transcript,
		toolCalls: records,
		turns: 0,
		inputTokens: 0,
		outputTokens: 0,
		elapsedMs: 0,
		truncation: false,
		modelReturned: "",
		protocolVersion: args.host?.protocolVersion,
		schemaRejectionCount: 0,
		toolErrorCount: 0,
		recoveredToolError: false,
	};
	const finish = (end: AgentRun["end"], detail?: string): AgentRun => {
		clearTimeout(timer);
		run.end = end;
		run.endDetail = detail;
		run.elapsedMs = Date.now() - started;
		return run;
	};

	try {
		for (let turn = 0; turn < limits.maxTurns; turn++) {
			let res: Awaited<ReturnType<Provider["chat"]>>;
			try {
				res = await args.provider.chat({
					system: args.system ?? SYSTEM_PROMPT,
					messages: transcript,
					tools: args.host?.tools ?? [],
					maxTokens: limits.maxOutputTokens,
					signal: deadline.signal,
				});
			} catch (e) {
				if (deadline.signal.aborted)
					return finish("limit_exhausted", "run deadline");
				if (e instanceof ProviderError) {
					return finish(
						e.kind === "rate_limit" ? "rate_limited" : "infra_failed",
						e.message,
					);
				}
				throw e;
			}
			run.turns++;
			run.inputTokens += res.inputTokens;
			run.outputTokens += res.outputTokens;
			run.modelReturned = res.model;
			transcript.push({
				role: "assistant",
				text: res.text,
				toolCalls: res.toolCalls,
			});

			if (res.toolCalls.length === 0) {
				run.finalText = res.text;
				if (res.stop === "length") run.truncation = true;
				return finish("answered");
			}
			if (res.stop === "length") run.truncation = true;
			if (!args.host) {
				return finish(
					"infra_failed",
					"model called a tool in the no-tools condition",
				);
			}
			if (records.length + res.toolCalls.length > limits.maxToolCalls) {
				return finish("limit_exhausted", "tool-call limit");
			}
			const results: ToolResult[] = [];
			for (const call of res.toolCalls) {
				results.push(
					await executeCall(
						call,
						args.host,
						limits,
						records,
						run,
						deadline.signal,
					),
				);
				if (deadline.signal.aborted)
					return finish("limit_exhausted", "run deadline");
			}
			transcript.push({ role: "tool", results });
		}
		return finish("limit_exhausted", "turn limit");
	} catch (e) {
		if (e instanceof ToolHostCrash)
			return finish("infra_failed", `tool server: ${e.message}`);
		if (deadline.signal.aborted)
			return finish("limit_exhausted", "run deadline");
		throw e;
	} finally {
		clearTimeout(timer);
	}
}

async function executeCall(
	call: ToolCall,
	host: ToolHost,
	limits: Limits,
	records: ToolCallRecord[],
	run: AgentRun,
	signal: AbortSignal,
): Promise<ToolResult> {
	let text: string;
	let isError: boolean;
	let schemaRejection = false;
	let timedOut = false;
	if (call.argsError) {
		text = `Tool call rejected: the arguments were not valid JSON (${call.argsError}). Send a JSON object.`;
		isError = true;
	} else {
		const out = await raceDeadline(
			host.call(call.name, call.args, limits.toolTimeoutMs),
			signal,
		);
		text = out.text;
		isError = out.isError;
		schemaRejection = out.schemaRejection;
		timedOut = out.timedOut;
	}
	let truncated = false;
	if (text.length > limits.toolResultChars) {
		text = `${text.slice(0, limits.toolResultChars)}\n[truncated]`;
		truncated = true;
	}
	if (isError) run.toolErrorCount++;
	else if (records.some((r) => r.isError)) run.recoveredToolError = true;
	if (schemaRejection) run.schemaRejectionCount++;
	records.push({
		name: call.name,
		args: call.args,
		text,
		isError,
		schemaRejection,
		timedOut,
		truncated,
	});
	return { id: call.id, name: call.name, text, isError };
}

function raceDeadline<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		if (signal.aborted) return reject(new Error("deadline"));
		signal.addEventListener("abort", () => reject(new Error("deadline")), {
			once: true,
		});
		p.then(resolve, reject);
	});
}
