export interface ToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface ToolCall {
	id: string;
	name: string;
	args: unknown;
	/** Set when the provider returned arguments that are not valid JSON. */
	argsError?: string;
}

export interface ToolResult {
	id: string;
	name: string;
	text: string;
	isError: boolean;
}

export type Msg =
	| { role: "user"; text: string }
	| { role: "assistant"; text: string; toolCalls: ToolCall[] }
	| { role: "tool"; results: ToolResult[] };

export interface TurnResult {
	text: string;
	toolCalls: ToolCall[];
	stop: "end" | "tool_use" | "length" | "other";
	inputTokens: number;
	outputTokens: number;
	model: string;
}

export interface ChatRequest {
	system: string;
	messages: Msg[];
	tools: ToolDef[];
	maxTokens: number;
	signal?: AbortSignal;
}

export interface Provider {
	id: string;
	chat(req: ChatRequest): Promise<TurnResult>;
}

/** kind: rate_limit (HTTP 429) stops the matrix; infra is retried; client is a request bug. */
export class ProviderError extends Error {
	constructor(
		public kind: "rate_limit" | "infra" | "client",
		message: string,
	) {
		super(message);
	}
}

export interface ToolCallOutcome {
	text: string;
	isError: boolean;
	schemaRejection: boolean;
	timedOut: boolean;
}

export interface ToolHost {
	tools: ToolDef[];
	call(
		name: string,
		args: unknown,
		timeoutMs: number,
	): Promise<ToolCallOutcome>;
	close(): Promise<void>;
	protocolVersion?: string;
	instructions?: string;
}

/** The server process died or the transport failed: an infrastructure failure, not a model failure. */
export class ToolHostCrash extends Error {}
