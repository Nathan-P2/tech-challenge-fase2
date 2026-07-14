const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

type ReportType = "daily" | "weekly";
type JsonRecord = Record<string, unknown>;

type DeliveryPayload = {
  id: string;
  name: string;
  demand: number;
  priority: number;
};

type VehiclePayload = {
  id: string;
  capacity: number;
  maxDistance: number;
};

type RoutePayload = {
  vehicle: VehiclePayload;
  deliveries: DeliveryPayload[];
  load: number;
  distance: number;
};

type PlanPayload = {
  routes: RoutePayload[];
  feasible: boolean;
  totalDistance: number;
  fitness: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDelivery(value: unknown): value is DeliveryPayload {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && isNumber(value.demand)
    && isNumber(value.priority);
}

function isVehicle(value: unknown): value is VehiclePayload {
  return isRecord(value)
    && typeof value.id === "string"
    && isNumber(value.capacity)
    && isNumber(value.maxDistance);
}

function isRoute(value: unknown): value is RoutePayload {
  return isRecord(value)
    && isVehicle(value.vehicle)
    && Array.isArray(value.deliveries)
    && value.deliveries.every(isDelivery)
    && isNumber(value.load)
    && isNumber(value.distance);
}

function isPlan(value: unknown): value is PlanPayload {
  return isRecord(value)
    && Array.isArray(value.routes)
    && value.routes.every(isRoute)
    && typeof value.feasible === "boolean"
    && isNumber(value.totalDistance)
    && isNumber(value.fitness);
}

function reportType(value: unknown): ReportType {
  return value === "weekly" ? "weekly" : "daily";
}

function historyTimestamp(entry: JsonRecord): number | null {
  const value = entry.executedAt ?? entry.executed_at;
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function selectHistory(
  history: JsonRecord[],
  type: ReportType,
  now = Date.now(),
): JsonRecord[] {
  const limited = history.slice(-30);
  if (type === "daily") return limited;
  return limited.filter((entry) => {
    const timestamp = historyTimestamp(entry);
    return timestamp !== null && timestamp <= now && timestamp >= now - WEEK_IN_MS;
  });
}

function estimatedRouteMinutes(route: RoutePayload): number {
  return route.distance / 30 * 60 + route.deliveries.length * 8;
}

function fallback(
  plan: PlanPayload,
  question: string,
  historySize: number,
  type: ReportType,
): string {
  const routes = plan.routes.map((route) => {
    const deliveries = route.deliveries.length
      ? route.deliveries.map((item, index) =>
        `${index + 1}. **${item.name}** (${item.id}) - ${item.demand} unidades - prioridade ${item.priority}`,
      ).join("\n")
      : "Sem entregas";
    return `### Veículo ${route.vehicle.id}\n${deliveries}\n\n- Carga: ${route.load}/${route.vehicle.capacity}\n- Distância: ${route.distance.toFixed(1)}/${route.vehicle.maxDistance.toFixed(1)} km\n- Tempo estimado: ${estimatedRouteMinutes(route).toFixed(1)} min\n- Saída e retorno: Hospital Central`;
  }).join("\n\n");
  const receivedQuestion = question
    ? `\n\n## Pergunta recebida\n${question}\n\nConfigure a OpenRouter para obter a resposta em linguagem natural.`
    : "";
  const title = type === "weekly" ? "RELATÓRIO SEMANAL" : "RELATÓRIO DIÁRIO";
  return `## ${title} - MODO DEMONSTRAÇÃO\n\n${routes}\n\n## Resumo\nPlano ${plan.feasible ? "viável" : "com violações"}, distância total de ${plan.totalDistance.toFixed(1)} km e fitness ${plan.fitness.toFixed(1)}. Histórico do período: ${historySize} execuções.${receivedQuestion}\n\n## Recomendação\nConfirme os itens críticos antes da saída e registre a conclusão de cada parada.`;
}

function detailedInstructions(): string {
  return "Para cada veículo, informe saída e retorno ao Hospital Central, ordem exata das paradas, identificador, nome, quantidade e prioridade de cada entrega, carga total/capacidade, distância/autonomia, tempo estimado e alertas de restrição.";
}

function reportTask(type: ReportType, historySize: number): string {
  const patterns = historySize >= 2
    ? "Identifique tendências entre as execuções e justifique as melhorias com esses padrões."
    : "Informe que ainda não há histórico suficiente para identificar tendências.";
  if (type === "weekly") {
    return `Gere um relatório semanal consolidado. Compare as execuções do período, destaque tendências, melhor configuração, problemas recorrentes, economia de tempo, uso de recursos e três melhorias. Não gere tabelas. ${patterns}`;
  }
  return `Gere um relatório diário de eficiência comparando o plano atual com a referência. Analise distância, capacidade, prioridades, economia de tempo, uso de recursos e apresente três melhorias. Não gere tabelas. ${patterns}`;
}

function readReport(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.choices)) return null;
  const choice = data.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return null;
  return typeof choice.message.content === "string" ? choice.message.content : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!isRecord(body) || !isPlan(body.plan)) {
    return Response.json({ error: "O campo plan.routes é obrigatório e deve conter rotas válidas" }, { status: 400 });
  }

  const type = reportType(body.reportType);
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  const receivedHistory = Array.isArray(body.history) ? body.history.filter(isRecord) : [];
  const history = selectHistory(receivedHistory, type);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ report: fallback(body.plan, question, history.length, type), mode: "demo" });
  }

  const task = question
    ? `Responda objetivamente à pergunta usando somente os dados e o histórico do período fornecido. Pergunta: ${question}`
    : `${detailedInstructions()} ${reportTask(type, history.length)}`;
  const context = { ...body, reportType: type, question: question || undefined, history };
  const prompt = `Você coordena a logística de medicamentos de um hospital. Prioridade 3 é crítica. O tempo usa velocidade média de 30 km/h e 8 minutos de atendimento por entrega. ${task} Não invente ruas, horários, durações ou valores. Responda em Markdown bem estruturado. Dados:\n${JSON.stringify(context)}`;

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
  const report = readReport(await response.json());
  if (!report) return Response.json({ error: "Resposta vazia" }, { status: 502 });
  return Response.json({ report, mode: "openrouter" });
}
