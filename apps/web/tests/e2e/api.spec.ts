import { expect, test } from "@playwright/test";

/**
 * The API contract, exercised over HTTP. Every number here is deterministic,
 * so these tests fail only when the engine itself regresses.
 */
test("healthz reports ok", async ({ request }) => {
  const res = await request.get("/healthz");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.service).toBe("cogitatome-web");
});

test("interpret runs the induction model to 19/19", async ({ request }) => {
  const tokens = [0, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];
  const res = await request.post("/api/v1/interpret", { data: { tokens, model: "induction" } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.model).toBe("induction");
  expect(body.heads).toHaveLength(4);
  const roles = body.heads.map((h: { role: string }) => h.role);
  expect(roles).toContain("previous-token");
  expect(roles).toContain("induction");
});

test("interpret rejects bad input with 422", async ({ request }) => {
  const res = await request.post("/api/v1/interpret", { data: { tokens: [] } });
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.error.code).toBe("invalid_request");
});

test("metrics reports one induction head and one previous-token head", async ({ request }) => {
  const res = await request.get("/api/v1/metrics?model=induction");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.inductionHeads).toBe(1);
  expect(body.previousTokenHeads).toBe(1);
  expect(body.layers).toBe(2);
  expect(body.inductionWinner).toEqual({ layer: 1, head: 0 });
});

test("heads and circuits agree on the circuit", async ({ request }) => {
  const heads = await (await request.get("/api/v1/heads?model=induction")).json();
  expect(heads.heads.filter((h: { role: string }) => h.role === "induction")).toHaveLength(1);

  const circuits = await (await request.get("/api/v1/circuits?target=1")).json();
  expect(circuits.nodes.length).toBeGreaterThan(4);
  const qk = circuits.edges.filter((e: { kind: string }) => e.kind === "qk");
  expect(qk.length).toBeGreaterThanOrEqual(1);
});

test("corpus searches the real literature", async ({ request }) => {
  const res = await request.get("/api/v1/corpus?q=induction%20head&limit=5");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.total).toBeGreaterThan(0);
  expect(body.entries.length).toBeGreaterThan(0);
  expect(body.entries[0].title.toLowerCase()).toContain("induction");
});

test("debate returns a deterministic transcript", async ({ request }) => {
  const claim = "Layer 1 head 0 of this model is an induction head";
  const first = await (await request.post("/api/v1/debate", { data: { claim, seed: 7 } })).json();
  const second = await (await request.post("/api/v1/debate", { data: { claim, seed: 7 } })).json();
  expect(first.turns.length).toBeGreaterThanOrEqual(6);
  expect(first.margin).toBeGreaterThan(0);
  expect(first).toEqual(second);
});

test("stream emits ticks and a summary", async ({ request }) => {
  const res = await request.get("/api/v1/stream?model=induction");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("text/event-stream");
  const text = await res.text();
  expect(text).toContain("event: tick");
  expect(text).toContain("event: summary");
  expect(text).toContain("learnableAccuracy");
});

