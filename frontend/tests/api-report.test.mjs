import assert from "node:assert/strict";
import test from "node:test";

import { POST, selectHistory } from "../app/api/report/route.ts";

const plan = {
  routes: [{
    vehicle: { id: "V1", capacity: 12, maxDistance: 30 },
    deliveries: [{ id: "U08", name: "Paciente Carla", demand: 2, priority: 3 }],
    load: 2,
    distance: 10,
  }],
  feasible: true,
  totalDistance: 10,
  fitness: 20,
};

function request(body) {
  return new Request("http://localhost/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("filtra o histórico semanal para os últimos sete dias", () => {
  const now = Date.parse("2026-07-13T12:00:00Z");
  const selected = selectHistory([
    { executedAt: "2026-07-01T12:00:00Z", fitness: 30 },
    { executedAt: "2026-07-10T12:00:00Z", fitness: 20 },
  ], "weekly", now);
  assert.deepEqual(selected.map((entry) => entry.fitness), [20]);
});

test("modo demonstração gera instruções detalhadas", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const response = await POST(request({ plan, reportType: "daily", history: [] }));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.mode, "demo");
    assert.match(data.report, /Paciente Carla/);
    assert.match(data.report, /2 unidades/);
    assert.match(data.report, /prioridade 3/);
    assert.match(data.report, /Tempo estimado/);
  } finally {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test("relatório semanal envia período, histórico e contrato detalhado à OpenRouter", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "teste";
  let sentBody;
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(String(options.body));
    return Response.json({ choices: [{ message: { content: "relatório semanal" } }] });
  };
  try {
    const recent = new Date().toISOString();
    const response = await POST(request({
      plan,
      reportType: "weekly",
      history: [
        { executedAt: recent, fitness: 25 },
        { executedAt: recent, fitness: 20 },
      ],
    }));
    const data = await response.json();
    const prompt = sentBody.messages[0].content;
    assert.equal(data.mode, "openrouter");
    assert.match(prompt, /relatório semanal consolidado/i);
    assert.match(prompt, /quantidade e prioridade/i);
    assert.match(prompt, /melhor configuração/i);
    assert.match(prompt, /"reportType":"weekly"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test("rejeita plano incompleto", async () => {
  const response = await POST(request({ plan: { routes: [] } }));
  assert.equal(response.status, 400);
});
