import type {
	ChatRequest,
	Msg,
	Provider,
	ToolCall,
	TurnResult,
} from "../types.js";
import { postJson } from "./http.js";

export function toOpenAiMessages(system: string, messages: Msg[]): unknown[] {
	const out: unknown[] = [{ role: "system", content: system }];
	for (const m of messages) {
		if (m.role === "user") out.push({ role: "user", content: m.text });
		else if (m.role === "assistant") {
			out.push({
				role: "assistant",
				content: m.text || null,
				...(m.toolCalls.length > 0
					? {
							tool_calls: m.toolCalls.map((c) => ({
								id: c.id,
								type: "function",
								function: {
									name: c.name,
									arguments: c.argsError
										? (c.args as string)
										: JSON.stringify(c.args ?? {}),
								},
							})),
						}
					: {}),
			});
		} else {
			for (const r of m.results)
				out.push({ role: "tool", tool_call_id: r.id, content: r.text });
		}
	}
	return out;
}

export function parseOpenAiResponse(raw: unknown): TurnResult {
	const r = raw as {
		choices?: {
			message?: {
				content?: string | null;
				tool_calls?: {
					id: string;
					function: { name: string; arguments: string };
				}[];
			};
			finish_reason?: string;
		}[];
		usage?: { prompt_tokens?: number; completion_tokens?: number };
		model?: string;
	};
	const choice = r.choices?.[0];
	const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c) => {
		try {
			return {
				id: c.id,
				name: c.function.name,
				args: JSON.parse(c.function.arguments || "{}"),
			};
		} catch (e) {
			// keep the raw string so the model sees what it sent; the loop reports the parse error back
			return {
				id: c.id,
				name: c.function.name,
				args: c.function.arguments,
				argsError: (e as Error).message,
			};
		}
	});
	const fr = choice?.finish_reason;
	const stop =
		fr === "tool_calls" || toolCalls.length > 0
			? "tool_use"
			: fr === "length"
				? "length"
				: fr === "stop"
					? "end"
					: "other";
	return {
		text: choice?.message?.content ?? "",
		toolCalls,
		stop,
		inputTokens: r.usage?.prompt_tokens ?? 0,
		outputTokens: r.usage?.completion_tokens ?? 0,
		model: r.model ?? "unknown",
	};
}

export function openAiProvider(opts: {
	id: string;
	model: string;
	baseUrl: string;
	apiKey: string;
}): Provider {
	return {
		id: opts.id,
		async chat(req: ChatRequest): Promise<TurnResult> {
			const body: Record<string, unknown> = {
				model: opts.model,
				max_tokens: req.maxTokens,
				messages: toOpenAiMessages(req.system, req.messages),
			};
			if (req.tools.length > 0) {
				body.tools = req.tools.map((t) => ({
					type: "function",
					function: {
						name: t.name,
						description: t.description,
						parameters: t.inputSchema,
					},
				}));
			}
			const raw = await postJson(
				`${opts.baseUrl}/v1/chat/completions`,
				{ authorization: `Bearer ${opts.apiKey}` },
				body,
				req.signal,
			);
			return parseOpenAiResponse(raw);
		},
	};
}
