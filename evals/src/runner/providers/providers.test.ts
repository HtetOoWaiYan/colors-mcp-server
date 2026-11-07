import { describe, expect, it } from "vitest";
import type { Msg } from "../types.js";
import { parseAnthropicResponse, toAnthropicMessages } from "./anthropic.js";
import { parseOpenAiResponse, toOpenAiMessages } from "./openai.js";

const convo: Msg[] = [
	{ role: "user", text: "q" },
	{
		role: "assistant",
		text: "thinking",
		toolCalls: [
			{ id: "c1", name: "t", args: { a: 1 } },
			{ id: "c2", name: "t", args: { a: 2 } },
		],
	},
	{
		role: "tool",
		results: [
			{ id: "c1", name: "t", text: "r1", isError: false },
			{ id: "c2", name: "t", text: "bad", isError: true },
		],
	},
];

describe("anthropic adapter", () => {
	it("keeps ids, order and error flags", () => {
		const m = toAnthropicMessages(convo) as { role: string; content: any }[];
		expect(m[1]?.content.map((b: any) => b.type)).toEqual([
			"text",
			"tool_use",
			"tool_use",
		]);
		expect(m[2]?.role).toBe("user");
		expect(
			m[2]?.content.map((b: any) => [b.tool_use_id, b.is_error ?? false]),
		).toEqual([
			["c1", false],
			["c2", true],
		]);
	});
	it("parses tool_use, stop reasons and usage", () => {
		const r = parseAnthropicResponse({
			content: [
				{ type: "text", text: "hi" },
				{ type: "tool_use", id: "x", name: "t", input: { k: 1 } },
			],
			stop_reason: "tool_use",
			usage: { input_tokens: 7, output_tokens: 3 },
			model: "claude-haiku-5-5",
		});
		expect(r).toMatchObject({
			text: "hi",
			stop: "tool_use",
			inputTokens: 7,
			outputTokens: 3,
			model: "claude-haiku-5-5",
		});
		expect(r.toolCalls).toEqual([{ id: "x", name: "t", args: { k: 1 } }]);
		expect(
			parseAnthropicResponse({ content: [], stop_reason: "max_tokens" }).stop,
		).toBe("length");
		const cached = parseAnthropicResponse({
			content: [],
			usage: {
				input_tokens: 4,
				cache_creation_input_tokens: 100,
				cache_read_input_tokens: 20,
				output_tokens: 1,
			},
		});
		expect(cached.inputTokens).toBe(124);
	});
});

describe("openai adapter", () => {
	it("emits tool_calls with JSON-string arguments and one tool message per result", () => {
		const m = toOpenAiMessages("sys", convo) as any[];
		expect(m[0]).toEqual({ role: "system", content: "sys" });
		expect(
			m[2].tool_calls.map((c: any) => [c.id, c.function.arguments]),
		).toEqual([
			["c1", '{"a":1}'],
			["c2", '{"a":2}'],
		]);
		expect(m.slice(3).map((x) => [x.role, x.tool_call_id])).toEqual([
			["tool", "c1"],
			["tool", "c2"],
		]);
	});
	it("parses several calls and flags malformed arguments", () => {
		const r = parseOpenAiResponse({
			choices: [
				{
					finish_reason: "tool_calls",
					message: {
						content: null,
						tool_calls: [
							{ id: "a", function: { name: "t", arguments: '{"x":1}' } },
							{ id: "b", function: { name: "t", arguments: "{oops" } },
						],
					},
				},
			],
			usage: { prompt_tokens: 4, completion_tokens: 2 },
			model: "gpt-6-luna",
		});
		expect(r.stop).toBe("tool_use");
		expect(r.toolCalls[0]).toEqual({ id: "a", name: "t", args: { x: 1 } });
		expect(r.toolCalls[1]?.argsError).toBeTruthy();
		expect(
			parseOpenAiResponse({
				choices: [{ finish_reason: "length", message: { content: "x" } }],
			}).stop,
		).toBe("length");
	});
});
