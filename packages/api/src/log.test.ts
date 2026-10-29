import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, request, seedGroup, seedUser, signIn } from "../test/helpers";
import { type RequestLog, requestLog } from "./log";

function captureLogs() {
  const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  return () =>
    spy.mock.calls.map(([line]) => JSON.parse(line as string) as RequestLog);
}

afterEach(() => vi.restoreAllMocks());

describe("request log", () => {
  it("logs one JSON line with the matched route pattern and status", async () => {
    const logs = captureLogs();
    const user = await seedUser();
    const { group } = await seedGroup(user);
    const session = await signIn(user.id);

    const res = await api(`/api/groups/${group.id}`, { session });

    expect(res.status).toBe(200);
    expect(logs()).toHaveLength(1);
    const [entry] = logs();
    expect(Object.keys(entry).sort()).toEqual(
      ["durationMs", "method", "requestId", "route", "status"].sort(),
    );
    expect(entry).toMatchObject({
      method: "GET",
      route: "/api/groups/:gid",
      status: 200,
    });
    expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.durationMs).toBeTypeOf("number");
  });

  it("uses the cf-ray header as the request id", async () => {
    const logs = captureLogs();
    await request("/api/health", {
      headers: { "cf-ray": "8f1a2b3c4d5e6f70-SJC" },
    });
    expect(logs()[0]).toMatchObject({
      requestId: "8f1a2b3c4d5e6f70-SJC",
      route: "/api/health",
    });
  });

  it("logs rejected requests with their status", async () => {
    const logs = captureLogs();
    const res = await api("/api/groups", { method: "POST", json: {} });
    expect(res.status).toBe(401);
    expect(logs()[0]).toMatchObject({ method: "POST", status: 401 });
    expect(logs()[0]).not.toHaveProperty("error");
  });

  it("measures duration and records thrown errors", async () => {
    const logs = captureLogs();
    vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1250);
    const app = new Hono().use(requestLog).get("/boom", () => {
      throw new Error("kaput");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    expect(logs()[0]).toMatchObject({
      route: "/boom",
      status: 500,
      durationMs: 250,
      error: "Error: kaput",
    });
  });
});
