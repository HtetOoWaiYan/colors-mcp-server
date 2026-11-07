import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";

export interface ToolDef<
	I extends z.ZodType = z.ZodType,
	O extends z.ZodType = z.ZodType,
> {
	name: string;
	title: string;
	description: string;
	inputSchema: I;
	outputSchema: O;
	handler: (args: z.infer<I>) => CallToolResult;
}

export const defineTool = <I extends z.ZodType, O extends z.ZodType>(
	t: ToolDef<I, O>,
): ToolDef<I, O> => t;
