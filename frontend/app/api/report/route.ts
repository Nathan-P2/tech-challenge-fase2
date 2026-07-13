const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

function fallback(plan: any, question: string) {
  const routes = plan.routes.map((route: any) => {
    const sequence = route.deliveries.map((item: any) => `${item.name} (P${item.priority})`).join(" → ") || "sem entregas";
    return `${route.vehicle.id}: Hospital Central → ${sequence} → Hospital Central\nCarga ${route.load}/${route.vehicle.capacity} · Distância ${route.distance.toFixed(1)} km`;
  }).join("\n\n");
  const receivedQuestion = question ? `\n\nPergunta recebida: ${question}\nConfigure a OpenRouter para obter a resposta em linguagem natural.` : "";
  return `RELATÓRIO OPERACIONAL — MODO DEMONSTRAÇÃO\n\n${routes}\n\nResumo: plano ${plan.feasible ? "viável" : "com violações"}, distância total de ${plan.totalDistance.toFixed(1)} km e fitness ${plan.fitness.toFixed(1)}.${receivedQuestion}\n\nRecomendação: confirme os itens críticos antes da saída e registre o horário de conclusão de cada parada.`;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body?.plan || !Array.isArray(body.plan.routes)) {
    return Response.json({ error: "O campo plan.routes é obrigatório" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return Response.json({ report: fallback(body.plan, question), mode: "demo" });

  const task = question
    ? `Responda objetivamente à pergunta usando somente os dados fornecidos. Pergunta: ${question}`
    : "Gere instruções por veículo, um relatório diário de eficiência e três recomendações. Analise distância e ocupação da capacidade como indicadores de uso de recursos. Não calcule economia de tempo porque não há dados de duração.";
  const prompt = `Você coordena a logística de medicamentos de um hospital. Prioridade 3 é crítica. ${task} Não invente ruas, horários, durações ou valores. Dados:\n${JSON.stringify(body)}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "Rota Gen - Tech Challenge",
    },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }] }),
  });

  if (!response.ok) return Response.json({ error: "Falha na OpenRouter" }, { status: 502 });
  const data: any = await response.json();
  const report = data.choices?.[0]?.message?.content;
  if (!report) return Response.json({ error: "Resposta vazia" }, { status: 502 });
  return Response.json({ report, mode: "openrouter" });
}
