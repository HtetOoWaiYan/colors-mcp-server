import type {
	ChatRequest,
	Msg,
	Provider,
	ToolCall,
	TurnResult,
} from "../types.js";
import { postJson } from "./http.js";

interface AnthropicBlock {
	type: string;
	text?: string;
	id?: string;
	name?: string;
	input?: unknown;
}

export function toAnthropicMessages(messages: Msg[]): unknown[] {
	return messages.map((m) => {
		if (m.role === "user") return { role: "user", content: m.text };
		if (m.role === "assistant") {
			const content: unknown[] = [];
			if (m.text) content.push({ type: "text", text: m.text });
			for (const c of m.toolCalls) {
				content.push({
					type: "tool_use",
					id: c.id,
					name: c.name,
					input: c.argsError ? {} : (c.args ?? {}),
				});
			}
			return { role: "assistant", content };
		}
		return {
			role: "user",
			content: m.results.map((r) => ({
				type: "tool_result",
				tool_use_id: r.id,
				content: r.text,
				...(r.isError ? { is_error: true } : {}),
			})),
		};
	});
}

export function parseAnthropicResponse(raw: unknown): TurnResult {
	const r = raw as {
		content?: AnthropicBlock[];
		stop_reason?: string;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};
		model?: string;
	};
	const blocks = r.content ?? [];
	const text = blocks
		.filter((b) => b.type === "text")
		.map((b) => b.text ?? "")
		.join("");
	const toolCalls: ToolCall[] = blocks
		.filter((b) => b.type === "tool_use")
		.map((b) => ({
			id: b.id as string,
			name: b.name as string,
			args: b.input ?? {},
		}));
	const stop =
		r.stop_reason === "tool_use"
			? "tool_use"
			: r.stop_reason === "max_tokens"
				? "length"
				: r.stop_reason === "end_turn"
					? "end"
					: "other";
	return {
		text,
		toolCalls,
		stop,
		// the proxy reports cached prompt tokens separately; count them so both providers are comparable
		inputTokens:
			(r.usage?.input_tokens ?? 0) +
			(r.usage?.cache_creation_input_tokens ?? 0) +
			(r.usage?.cache_read_input_tokens ?? 0),
		outputTokens: r.usage?.output_tokens ?? 0,
		model: r.model ?? "unknown",
	};
}

export function anthropicProvider(opts: {
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
				system: req.system,
				messages: toAnthropicMessages(req.messages),
			};
			if (req.tools.length > 0) {
				body.tools = req.tools.map((t) => ({
					name: t.name,
					description: t.description,
					input_schema: t.inputSchema,
				}));
			}
			const raw = await postJson(
				`${opts.baseUrl}/v1/messages`,
				{ "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
				body,
				req.signal,
			);
			return parseAnthropicResponse(raw);
		},
	};
}
