"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { normalizeMarkdown } from "./markdown";

type Delivery = { id: string; name: string; x: number; y: number; demand: number; priority: 1 | 2 | 3 };
type Vehicle = { id: string; capacity: number; maxDistance: number };
type VehicleRoute = { vehicle: Vehicle; deliveries: Delivery[]; load: number; distance: number };
type Plan = { routes: VehicleRoute[]; totalDistance: number; priorityPenalty: number; overload: number; autonomyExcess: number; fitness: number; feasible: boolean };
type RankedGenome = { genome: string[]; plan: Plan };
type Snapshot = { generation: number; best: number; average: number; plan: Plan };
type Config = { population: number; generations: number; mutation: number; seed: number };
type ReportType = "daily" | "weekly";
type HistoryEntry = {
  executedAt: string;
  configuration: Config;
  fitness: number;
  totalDistanceKm: number;
  priorityPenalty: number;
  capacityUtilizationPercent: number;
  estimatedCompletionMinutes: number;
  timeSavedVsBaselineMinutes: number;
};

const DEPOT = { name: "Hospital Central", x: 0, y: 0 };
const DELIVERIES: Delivery[] = [
  { id: "U01", name: "UPA Norte", x: 2, y: 8, demand: 4, priority: 3 },
  { id: "U02", name: "Clínica Leste", x: 7, y: 5, demand: 3, priority: 2 },
  { id: "U03", name: "UBS Jardim", x: 5, y: 1, demand: 2, priority: 1 },
  { id: "U04", name: "Paciente Ana", x: -3, y: 7, demand: 2, priority: 3 },
  { id: "U05", name: "Paciente Bruno", x: -6, y: 4, demand: 3, priority: 2 },
  { id: "U06", name: "UBS Sul", x: -4, y: -5, demand: 4, priority: 1 },
  { id: "U07", name: "Clínica Oeste", x: -8, y: -1, demand: 3, priority: 1 },
  { id: "U08", name: "Paciente Carla", x: 3, y: -6, demand: 2, priority: 3 },
  { id: "U09", name: "Pronto Atendimento", x: 8, y: -3, demand: 4, priority: 3 },
  { id: "U10", name: "Laboratório Regional", x: 1, y: 4, demand: 3, priority: 2 },
];
const VEHICLES: Vehicle[] = [
  { id: "V1", capacity: 12, maxDistance: 30 },
  { id: "V2", capacity: 12, maxDistance: 30 },
  { id: "V3", capacity: 12, maxDistance: 30 },
];
const ROUTE_COLORS = ["#e8583e", "#168f82", "#5c55cf"];
const DEFAULT_CONFIG: Config = { population: 50, generations: 80, mutation: 0.25, seed: 42 };
const AVERAGE_SPEED_KMH = 30;
const SERVICE_TIME_MINUTES = 8;
const HISTORY_KEY = "rota-gen-history";
const HISTORY_EVENT = "rota-gen-history-change";

function subscribeHistory(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(HISTORY_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(HISTORY_EVENT, callback);
  };
}

function historySnapshot() {
  return window.localStorage.getItem(HISTORY_KEY) || "[]";
}

function serverHistorySnapshot() {
  return "[]";
}

function parseHistory(snapshot: string): HistoryEntry[] {
  try {
    const stored: unknown = JSON.parse(snapshot);
    return Array.isArray(stored) ? stored.slice(-30) as HistoryEntry[] : [];
  } catch {
    return [];
  }
}

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function routeDistance(items: Delivery[]) {
  const points = [DEPOT, ...items, DEPOT];
  return points.slice(0, -1).reduce((sum, point, index) => sum + distance(point, points[index + 1]), 0);
}

function estimatedRouteTime(route: VehicleRoute) {
  return route.distance / AVERAGE_SPEED_KMH * 60 + route.deliveries.length * SERVICE_TIME_MINUTES;
}

function estimatedCompletionTime(plan: Plan) {
  return Math.max(0, ...plan.routes.map(estimatedRouteTime));
}

function capacityUtilization(plan: Plan) {
  const load = plan.routes.reduce((sum, route) => sum + route.load, 0);
  const capacity = plan.routes.reduce((sum, route) => sum + route.vehicle.capacity, 0);
  return capacity ? load / capacity * 100 : 0;
}

function historyEntry(plan: Plan, baseline: Plan, configuration: Config): HistoryEntry {
  return {
    executedAt: new Date().toISOString(),
    configuration: { ...configuration },
    fitness: Number(plan.fitness.toFixed(2)),
    totalDistanceKm: Number(plan.totalDistance.toFixed(2)),
    priorityPenalty: Number(plan.priorityPenalty.toFixed(2)),
    capacityUtilizationPercent: Number(capacityUtilization(plan).toFixed(2)),
    estimatedCompletionMinutes: Number(estimatedCompletionTime(plan).toFixed(2)),
    timeSavedVsBaselineMinutes: Number((estimatedCompletionTime(baseline) - estimatedCompletionTime(plan)).toFixed(2)),
  };
}

function decode(genome: string[]): Plan {
  const byId = Object.fromEntries(DELIVERIES.map((item) => [item.id, item]));
  const allocated = VEHICLES.map(() => [] as Delivery[]);
  let vehicleIndex = 0;

  genome.forEach((id) => {
    const delivery = byId[id];
    while (vehicleIndex < VEHICLES.length - 1) {
      const candidate = [...allocated[vehicleIndex], delivery];
      const load = candidate.reduce((sum, item) => sum + item.demand, 0);
      if (load <= VEHICLES[vehicleIndex].capacity && routeDistance(candidate) <= VEHICLES[vehicleIndex].maxDistance) break;
      vehicleIndex += 1;
    }
    allocated[vehicleIndex].push(delivery);
  });

  let totalDistance = 0;
  let overload = 0;
  let autonomyExcess = 0;
  let priorityPenalty = 0;
  let globalPosition = 0;
  const routes = VEHICLES.map((vehicle, index) => {
    const deliveries = allocated[index];
    const load = deliveries.reduce((sum, item) => sum + item.demand, 0);
    const currentDistance = routeDistance(deliveries);
    totalDistance += currentDistance;
    overload += Math.max(0, load - vehicle.capacity);
    autonomyExcess += Math.max(0, currentDistance - vehicle.maxDistance);
    deliveries.forEach((item) => {
      priorityPenalty += globalPosition * item.priority;
      globalPosition += 1;
    });
    return { vehicle, deliveries, load, distance: currentDistance };
  });
  const fitness = totalDistance + 4 * priorityPenalty + 1000 * overload + 1000 * autonomyExcess;
  return { routes, totalDistance, overload, autonomyExcess, priorityPenalty, fitness, feasible: overload === 0 && autonomyExcess === 0 };
}

function nearestNeighbor() {
  const remaining = [...DELIVERIES];
  const genome: string[] = [];
  let current: { x: number; y: number } = DEPOT;
  while (remaining.length) {
    const selected = remaining.reduce((best, item) => distance(current, item) < distance(current, best) ? item : best);
    genome.push(selected.id);
    remaining.splice(remaining.indexOf(selected), 1);
    current = selected;
  }
  return genome;
}

function crossover(parent1: string[], parent2: string[], random: () => number) {
  const first = Math.floor(random() * parent1.length);
  const second = Math.floor(random() * parent1.length);
  const start = Math.min(first, second);
  const end = Math.max(first, second) + 1;
  const child = Array<string | null>(parent1.length).fill(null);
  child.splice(start, end - start, ...parent1.slice(start, end));
  const remaining = parent2.filter((gene) => !child.includes(gene));
  child.forEach((gene, index) => { if (gene === null) child[index] = remaining.shift()!; });
  return child as string[];
}

function mutate(genome: string[], probability: number, random: () => number) {
  const result = [...genome];
  if (random() < probability) {
    const first = Math.floor(random() * result.length);
    let second = Math.floor(random() * result.length);
    if (first === second) second = (second + 1) % result.length;
    [result[first], result[second]] = [result[second], result[first]];
  }
  return result;
}

function rank(population: string[][]) {
  return population.map((genome) => ({ genome, plan: decode(genome) })).sort((a, b) => a.plan.fitness - b.plan.fitness);
}

function tournament(ranked: RankedGenome[], random: () => number) {
  const candidates = Array.from({ length: 4 }, () => ranked[Math.floor(random() * ranked.length)]);
  return candidates.reduce((best, item) => item.plan.fitness < best.plan.fitness ? item : best).genome;
}

function makeSnapshot(generation: number, ranked: RankedGenome[]): Snapshot {
  return {
    generation,
    best: ranked[0].plan.fitness,
    average: ranked.reduce((sum, item) => sum + item.plan.fitness, 0) / ranked.length,
    plan: ranked[0].plan,
  };
}

function runGenetic(config: Config) {
  const random = createRandom(config.seed);
  const genes = DELIVERIES.map((item) => item.id);
  let population = Array.from({ length: config.population }, () => shuffle(genes, random));
  population[0] = nearestNeighbor();
  let ranked = rank(population);
  const snapshots = [makeSnapshot(0, ranked)];

  for (let generation = 1; generation <= config.generations; generation++) {
    const next = [ranked[0].genome, ranked[1].genome].map((genome) => [...genome]);
    while (next.length < config.population) {
      const parent1 = tournament(ranked, random);
      const parent2 = tournament(ranked, random);
      next.push(mutate(crossover(parent1, parent2, random), config.mutation, random));
    }
    population = next;
    ranked = rank(population);
    snapshots.push(makeSnapshot(generation, ranked));
  }
  return snapshots;
}

function format(value: number, digits = 1) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      : part,
  );
}

function MarkdownReport({ text }: { text: string }) {
  const normalized = normalizeMarkdown(text);
  return <div className="markdown-report">
    {normalized.split("\n").map((rawLine, index) => {
      const line = rawLine.trimEnd();
      if (!line.trim()) return <div className="md-space" key={`space-${index}`} />;

      const heading = line.match(/^(#{1,6})\s+(.+)/);
      if (heading) {
        const content = renderInlineMarkdown(heading[2]);
        if (heading[1].length <= 2) return <h2 key={`heading-${index}`}>{content}</h2>;
        if (heading[1].length <= 4) return <h3 key={`heading-${index}`}>{content}</h3>;
        return <h4 key={`heading-${index}`}>{content}</h4>;
      }

      const listItem = line.match(/^(\s*)[-*]\s+(.+)/);
      if (listItem) {
        const level = Math.min(3, Math.floor(listItem[1].length / 2));
        return <div className={`md-list md-list-${level}`} key={`item-${index}`}><span>•</span><p>{renderInlineMarkdown(listItem[2])}</p></div>;
      }

      return <p key={`paragraph-${index}`}>{renderInlineMarkdown(line)}</p>;
    })}
  </div>;
}

function RouteCanvas({ plan }: { plan: Plan }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = box.width * scale;
    canvas.height = box.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, box.width, box.height);

    const all = [DEPOT, ...DELIVERIES];
    const xs = all.map((item) => item.x);
    const ys = all.map((item) => item.y);
    const padding = 48;
    const point = (item: { x: number; y: number }) => ({
      x: padding + ((item.x - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs))) * (box.width - padding * 2),
      y: box.height - padding - ((item.y - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys))) * (box.height - padding * 2),
    });

    plan.routes.forEach((route, index) => {
      const points = [DEPOT, ...route.deliveries, DEPOT].map(point);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((item) => ctx.lineTo(item.x, item.y));
      ctx.strokeStyle = ROUTE_COLORS[index];
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    });
    DELIVERIES.forEach((item) => {
      const current = point(item);
      ctx.beginPath();
      ctx.arc(current.x, current.y, item.priority === 3 ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = item.priority === 3 ? "#e8583e" : item.priority === 2 ? "#e0a11b" : "#7b8990";
      ctx.fill();
      ctx.fillStyle = "#152a35";
      ctx.font = "600 11px Arial";
      ctx.fillText(item.id, current.x + 9, current.y + 4);
    });
    const depot = point(DEPOT);
    ctx.fillStyle = "#152a35";
    ctx.fillRect(depot.x - 7, depot.y - 7, 14, 14);
    ctx.font = "700 10px Arial";
    ctx.fillText("HOSPITAL", depot.x + 11, depot.y + 4);
  }, [plan]);
  return <canvas ref={ref} className="route-map" aria-label="Mapa das rotas por veículo" />;
}

export default function Home() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [snapshots, setSnapshots] = useState(() => runGenetic(DEFAULT_CONFIG));
  const [current, setCurrent] = useState(DEFAULT_CONFIG.generations);
  const [report, setReport] = useState("");
  const [reportMode, setReportMode] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);
  const [question, setQuestion] = useState("");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const storedHistory = useSyncExternalStore(
    subscribeHistory,
    historySnapshot,
    serverHistorySnapshot,
  );
  const history = useMemo(() => parseHistory(storedHistory), [storedHistory]);
  const active = snapshots[current];
  const baseline = useMemo(() => decode(nearestNeighbor()), []);

  function saveHistory(entries: HistoryEntry[]) {
    const limited = entries.slice(-30);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  }

  function execute() {
    const result = runGenetic(config);
    setSnapshots(result);
    setCurrent(result.length - 1);
    setReport("");
    saveHistory([...history, historyEntry(result[result.length - 1].plan, baseline, config)]);
  }

  async function requestAnalysis(questionText = "") {
    setLoadingReport(true);
    setReport("");
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: active.plan,
          generation: active.generation,
          baseline,
          timeAssumptions: { averageSpeedKmh: AVERAGE_SPEED_KMH, serviceTimeMinutes: SERVICE_TIME_MINUTES },
          timeComparison: {
            baselineCompletionMinutes: estimatedCompletionTime(baseline),
            optimizedCompletionMinutes: estimatedCompletionTime(active.plan),
            timeSavedMinutes: estimatedCompletionTime(baseline) - estimatedCompletionTime(active.plan),
          },
          history,
          reportType,
          question: questionText || undefined,
        }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setReport(data.report);
      const source = data.mode === "openrouter" ? "OpenRouter" : "Demonstração";
      const period = reportType === "weekly" ? "semanal" : "diário";
      setReportMode(questionText ? `Resposta · ${source}` : `Relatório ${period} · ${source}`);
    } catch {
      setReport("Não foi possível gerar o relatório. Verifique a configuração e tente novamente.");
      setReportMode("Erro");
    } finally {
      setLoadingReport(false);
    }
  }

  const improvement = ((baseline.fitness - active.plan.fitness) / baseline.fitness) * 100;
  const completionMinutes = estimatedCompletionTime(active.plan);
  const timeSavedMinutes = estimatedCompletionTime(baseline) - completionMinutes;

  return <main>
    <section className="simulator" aria-label="Simulador de rotas">
      <aside className="settings">
        <div className="card-title"><span>1</span><div><small>Configuração</small><h2>Parâmetros</h2></div></div>
        <label>População <strong>{config.population}</strong><input type="range" min="20" max="120" step="10" value={config.population} onChange={(event) => setConfig({ ...config, population: Number(event.target.value) })} /></label>
        <label>Gerações <strong>{config.generations}</strong><input type="range" min="20" max="200" step="10" value={config.generations} onChange={(event) => setConfig({ ...config, generations: Number(event.target.value) })} /></label>
        <label>Mutação <strong>{Math.round(config.mutation * 100)}%</strong><input type="range" min="0.05" max="0.6" step="0.05" value={config.mutation} onChange={(event) => setConfig({ ...config, mutation: Number(event.target.value) })} /></label>
        <label>Semente <input className="seed" type="number" value={config.seed} onChange={(event) => setConfig({ ...config, seed: Number(event.target.value) || 1 })} /></label>
        <button className="run-button" onClick={execute}>Executar algoritmo</button>
        <button className="reset-button" onClick={() => setConfig(DEFAULT_CONFIG)}>Restaurar valores</button>
        <div className="scenario"><strong>Cenário fixo</strong><span>10 entregas · 3 veículos</span><span>Carga máxima: 12 · Autonomia: 30 km</span></div>
      </aside>

      <div className="result">
        <div className="result-heading">
          <div className="card-title"><span>2</span><div><small>Resultado</small><h2>Rotas encontradas</h2></div></div>
          <b className={active.plan.feasible ? "valid" : "invalid"}>{active.plan.feasible ? "Solução viável" : "Com restrições"}</b>
        </div>
        <RouteCanvas plan={active.plan} />
        <label className="generation">Visualizar geração <strong>{current}</strong><input type="range" min="0" max={snapshots.length - 1} value={current} onChange={(event) => setCurrent(Number(event.target.value))} /></label>

        <div className="metrics">
          <div><span>Distância total</span><strong>{format(active.plan.totalDistance)} km</strong></div>
          <div><span>Fitness</span><strong>{format(active.plan.fitness)}</strong></div>
          <div><span>Prioridade</span><strong>{format(active.plan.priorityPenalty, 0)}</strong></div>
          <div><span>Melhoria</span><strong>{format(improvement)}%</strong></div>
          <div><span>Conclusão estimada</span><strong>{format(completionMinutes)} min</strong></div>
          <div><span>Economia de tempo</span><strong>{timeSavedMinutes >= 0 ? "+" : ""}{format(timeSavedMinutes)} min</strong><small>vs. vizinho mais próximo</small></div>
        </div>

        <div className="routes">
          {active.plan.routes.map((route, index) => <article key={route.vehicle.id}>
            <i style={{ background: ROUTE_COLORS[index] }} />
            <div><strong>Veículo {route.vehicle.id}</strong><span>{route.deliveries.map((item) => item.id).join(" → ") || "Sem entregas"}</span></div>
            <small>{route.load}/{route.vehicle.capacity} carga · {format(route.distance)} km</small>
          </article>)}
        </div>
      </div>
    </section>

    <section className="report" id="relatorio">
      <div><small>Relatório operacional</small><h2>Consulte a rota em linguagem natural</h2><p>Gere um relatório ou faça uma pergunta objetiva sobre entregas, prioridades e veículos.</p><div className="history-summary"><span>Histórico local: <strong>{history.length}/30 execuções</strong></span>{history.length > 0 && <button onClick={() => saveHistory([])}>Limpar</button>}</div><label className="report-period" htmlFor="report-period">Período<select id="report-period" value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}><option value="daily">Diário</option><option value="weekly">Semanal</option></select></label><button onClick={() => requestAnalysis()} disabled={loadingReport}>{loadingReport ? "Processando..." : `Gerar relatório ${reportType === "weekly" ? "semanal" : "diário"}`}</button><div className="question-form"><label htmlFor="route-question">Pergunta sobre a rota</label><textarea id="route-question" maxLength={500} rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: Qual padrão aparece nas últimas execuções?" /><button onClick={() => requestAnalysis(question.trim())} disabled={loadingReport || !question.trim()}>Enviar pergunta</button></div></div>
      <div className="report-box"><b>{reportMode || "Resultado"}</b>{report ? <MarkdownReport text={report} /> : <p>O relatório aparecerá aqui após clicar no botão.</p>}</div>
    </section>
  </main>;
}
