import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
	type ToolCallOutcome,
	type ToolDef,
	type ToolHost,
	ToolHostCrash,
} from "./types.js";

export interface ServerSpec {
	command: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
}

/** TNI profile: only the text parts of `content` reach the model. structuredContent is dropped. */
export function contentText(result: unknown): string {
	const content =
		(result as { content?: { type: string; text?: string }[] }).content ?? [];
	return content
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}

const INVALID_PARAMS = /-32602|invalid arguments|invalid_type|validation/i;

export async function connectServer(spec: ServerSpec): Promise<ToolHost> {
	const transport = new StdioClientTransport({
		command: spec.command,
		args: spec.args,
		cwd: spec.cwd,
		env: { ...(process.env as Record<string, string>), ...spec.env },
		stderr: "ignore",
	});
	const client = new Client({ name: "colors-evals", version: "0.0.0" });
	let crashed: string | undefined;
	transport.onclose = () => {
		crashed ??= "server process closed";
	};
	// Capture the protocol version the server negotiated, instead of assuming it.
	let negotiated: string | undefined;
	let handler: ((m: unknown, extra?: unknown) => void) | undefined;
	Object.defineProperty(transport, "onmessage", {
		configurable: true,
		get: () => handler,
		set: (h: ((m: unknown, extra?: unknown) => void) | undefined) => {
			handler = h
				? (m, extra) => {
						const v = (m as { result?: { protocolVersion?: string } })?.result
							?.protocolVersion;
						if (v && !negotiated) negotiated = v;
						h(m, extra);
					}
				: undefined;
		},
	});
	try {
		await client.connect(transport);
		const listed = await client.listTools();
		const tools: ToolDef[] = listed.tools.map((t) => ({
			name: t.name,
			description: t.description ?? "",
			inputSchema: t.inputSchema as Record<string, unknown>,
		}));
		return {
			tools,
			protocolVersion: negotiated,
			instructions: client.getInstructions(),
			async call(name, args, timeoutMs): Promise<ToolCallOutcome> {
				if (crashed) throw new ToolHostCrash(crashed);
				try {
					const result = await client.callTool(
						{ name, arguments: (args ?? {}) as Record<string, unknown> },
						undefined,
						{ timeout: timeoutMs },
					);
					const text = contentText(result);
					const isError = (result as { isError?: boolean }).isError === true;
					return {
						text,
						isError,
						schemaRejection: isError && INVALID_PARAMS.test(text),
						timedOut: false,
					};
				} catch (e) {
					const err = e as { code?: number; message?: string };
					if (crashed) throw new ToolHostCrash(crashed);
					if (err.code === -32001) {
						return {
							text: `Tool call timed out after ${timeoutMs / 1000}s.`,
							isError: true,
							schemaRejection: false,
							timedOut: true,
						};
					}
					const message = err.message ?? String(e);
					return {
						text: message,
						isError: true,
						schemaRejection:
							err.code === -32602 || INVALID_PARAMS.test(message),
						timedOut: false,
					};
				}
			},
			async close() {
				await client.close().catch(() => {});
			},
		};
	} catch (e) {
		await client.close().catch(() => {});
		throw new ToolHostCrash(`could not start server: ${(e as Error).message}`);
	}
}
