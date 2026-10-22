// Do not retry writes here: claim, ACK and failure reporting have their own
// recovery rules. Only suppress repeated requests with a rejected credential.
export function createAgentApiClient({ apiUrl, token, timeoutMs, fetcher = fetch, now = Date.now }) {
  let unauthorizedUntil = 0;
  return async function post(path, body = {}) {
    if (now() < unauthorizedUntil) {
      throw new Error("Print Agent authentication rejected; waiting before reconnecting");
    }
    const response = await fetcher(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) {
      unauthorizedUntil = Math.max(unauthorizedUntil, now() + 60_000);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${path}: ${response.status} ${data?.error || "request failed"}`);
    return data;
  };
}
