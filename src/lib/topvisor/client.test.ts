import { describe, it, expect, vi } from "vitest";
import { createTopvisorClient, type FetchLike } from "./client";
import { TopvisorError } from "./errors";

const CREDS = { apiUserId: "376374", apiKey: "test-key" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch mock that returns queued responses (or invokes a per-call function). */
function queuedFetch(responses: Array<Response | (() => Promise<Response>)>): FetchLike {
  let i = 0;
  return (async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return typeof next === "function" ? next() : next;
  }) as unknown as FetchLike;
}

describe("Topvisor client", () => {
  it("returns result on a successful response and sends correct headers/URL", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.topvisor.com/v2/json/get/projects_2/projects");
      expect(init.method).toBe("POST");
      const h = new Headers(init.headers);
      expect(h.get("User-Id")).toBe("376374");
      expect(h.get("Authorization")).toBe("bearer test-key");
      return jsonResponse({ result: [{ id: 1 }], total: 1 });
    }) as unknown as FetchLike;

    const client = createTopvisorClient(CREDS, fetchImpl);
    const result = await client.post<Array<{ id: number }>>("get/projects_2/projects", {});
    expect(result).toEqual([{ id: 1 }]);
  });

  it("exposes pagination metadata via postWithMeta", async () => {
    const client = createTopvisorClient(CREDS, queuedFetch([jsonResponse({ result: [], total: 500, nextOffset: 100 })]));
    const { total, nextOffset } = await client.postWithMeta("get/keywords_2/keywords", {});
    expect(total).toBe(500);
    expect(nextOffset).toBe(100);
  });

  it("maps HTTP 401 to TOPVISOR_AUTH_FAILED and does NOT retry", async () => {
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as FetchLike;
    const client = createTopvisorClient(CREDS, fetchImpl);
    await expect(client.post("get/projects_2/projects", {}, { retries: 3 })).rejects.toMatchObject({
      code: "TOPVISOR_AUTH_FAILED",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // no retries on auth failure
  });

  it("retries on HTTP 429 then succeeds", async () => {
    const fetchImpl = queuedFetch([
      new Response("rate", { status: 429 }),
      jsonResponse({ result: { ok: true } }),
    ]);
    const spy = vi.fn(fetchImpl) as unknown as FetchLike;
    const client = createTopvisorClient(CREDS, spy);
    const res = await client.post<{ ok: boolean }>("edit/positions_2/checker/go", {}, { retries: 2 });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries transient 5xx and gives up as TOPVISOR_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 503 })) as unknown as FetchLike;
    const client = createTopvisorClient(CREDS, fetchImpl);
    await expect(client.post("get/positions_2/summary", {}, { retries: 2 })).rejects.toMatchObject({
      code: "TOPVISOR_UNAVAILABLE",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("times out and reports TOPVISOR_TIMEOUT", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as FetchLike;
    const client = createTopvisorClient(CREDS, fetchImpl);
    await expect(
      client.post("get/projects_2/projects", {}, { timeoutMs: 20, retries: 0 }),
    ).rejects.toMatchObject({ code: "TOPVISOR_TIMEOUT" });
  });

  it("maps the remote errors[] envelope (auth code 53)", async () => {
    const client = createTopvisorClient(
      CREDS,
      queuedFetch([jsonResponse({ result: null, errors: [{ string: "authorization error", code: "53" }] })]),
    );
    await expect(client.post("get/projects_2/projects", {})).rejects.toMatchObject({
      code: "TOPVISOR_AUTH_FAILED",
      remoteCode: "53",
    });
  });

  it("detects insufficient balance from the error message", async () => {
    const client = createTopvisorClient(
      CREDS,
      queuedFetch([jsonResponse({ result: null, errors: [{ string: "Недостаточно средств на балансе", code: "0" }] })]),
    );
    await expect(client.post("edit/positions_2/checker/go", {})).rejects.toMatchObject({
      code: "TOPVISOR_INSUFFICIENT_BALANCE",
    });
  });

  it("handles an empty result array", async () => {
    const client = createTopvisorClient(CREDS, queuedFetch([jsonResponse({ result: [] })]));
    await expect(client.post("get/positions_2/history", {})).resolves.toEqual([]);
  });

  it("throws TOPVISOR_BAD_RESPONSE on malformed (non-JSON) body", async () => {
    const client = createTopvisorClient(
      CREDS,
      queuedFetch([new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } })]),
    );
    await expect(client.post("get/projects_2/projects", {})).rejects.toMatchObject({
      code: "TOPVISOR_BAD_RESPONSE",
    });
  });

  it("throws when credentials are missing (TOPVISOR_NOT_CONNECTED)", () => {
    expect(() => createTopvisorClient({ apiUserId: "", apiKey: "" })).toThrow(TopvisorError);
  });
});
