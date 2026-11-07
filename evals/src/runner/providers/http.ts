import { ProviderError } from "../types.js";

export async function postJson(
	url: string,
	headers: Record<string, string>,
	body: unknown,
	signal?: AbortSignal,
): Promise<unknown> {
	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify(body),
			signal,
		});
	} catch (e) {
		if (signal?.aborted) throw e; // deadline: handled by the caller
		throw new ProviderError("infra", `network error: ${(e as Error).message}`);
	}
	const text = await res.text();
	if (res.status === 429)
		throw new ProviderError("rate_limit", `429: ${text.slice(0, 300)}`);
	if (res.status >= 500)
		throw new ProviderError("infra", `${res.status}: ${text.slice(0, 300)}`);
	if (!res.ok)
		throw new ProviderError("client", `${res.status}: ${text.slice(0, 500)}`);
	try {
		return JSON.parse(text);
	} catch {
		throw new ProviderError(
			"infra",
			`non-JSON response: ${text.slice(0, 200)}`,
		);
	}
}
