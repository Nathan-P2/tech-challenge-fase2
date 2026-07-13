import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handler } = await import(workerUrl.href);
  const request = new Request(`http://localhost${path}`, { headers: { accept: "text/html" } });
  if (typeof handler === "function") return handler(request);
  return handler.fetch(request);
}

test("renderiza o laboratorio Rota Gen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Rota Gen \| Laboratório de rotas hospitalares<\/title>/i);
  assert.match(html, /Otimização de rotas hospitalares/);
  assert.match(html, /Executar algoritmo/);
  assert.match(html, /Pergunta sobre a rota/);
  assert.match(html, /Economia de tempo/);
  assert.doesNotMatch(html, /SkeletonPreview|react-loading-skeleton/i);
});

test("mantem os metadados e a interface em portugues", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="pt-BR"/);
  assert.match(layout, /Rota Gen \| Laboratório de rotas hospitalares/);
  assert.match(page, /runGenetic/);
  assert.match(page, /Order crossover/);
  assert.match(page, /api\/report/);
  assert.match(page, /question: questionText/);
  assert.match(page, /rota-gen-history/);
  assert.match(page, /localStorage/);
  assert.match(page, /function MarkdownReport/);
  assert.doesNotMatch(page, /<pre>\{report\}<\/pre>/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter|react-loading-skeleton/);
});
