import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMarkdown } from "../app/markdown.ts";

test("remove cerca markdown da resposta", () => {
  const result = normalizeMarkdown("```markdown\n## Relatório\n\n- Entrega crítica\n```");

  assert.equal(result, "## Relatório\n\n- Entrega crítica");
  assert.doesNotMatch(result, /```|markdown/);
});

test("mantém o conteúdo quando não existe cerca", () => {
  const report = "## Relatório\n\nTexto operacional";

  assert.equal(normalizeMarkdown(report), report);
});
