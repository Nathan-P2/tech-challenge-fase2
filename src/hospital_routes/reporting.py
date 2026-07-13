from __future__ import annotations

import json
import os
from typing import Any

from .models import Depot, RoutePlan


def plan_as_dict(plan: RoutePlan) -> dict[str, Any]:
    total_load = sum(route.load for route in plan.routes)
    total_capacity = sum(route.vehicle.capacity for route in plan.routes)
    return {
        "fitness": round(plan.fitness, 2),
        "total_distance_km": round(plan.total_distance, 2),
        "feasible": plan.feasible,
        "priority_penalty": round(plan.priority_penalty, 2),
        "overload": round(plan.overload, 2),
        "autonomy_excess_km": round(plan.autonomy_excess, 2),
        "total_load": round(total_load, 2),
        "total_vehicle_capacity": round(total_capacity, 2),
        "capacity_utilization_percent": round(
            100 * total_load / total_capacity if total_capacity else 0, 2
        ),
        "routes": [
            {
                "vehicle": route.vehicle.id,
                "capacity": route.vehicle.capacity,
                "max_distance_km": route.vehicle.max_distance,
                "load": route.load,
                "distance_km": round(route.distance, 2),
                "deliveries": [
                    {
                        "id": item.id,
                        "name": item.name,
                        "demand": item.demand,
                        "priority": item.priority,
                    }
                    for item in route.deliveries
                ],
            }
            for route in plan.routes
        ],
    }


def build_prompt(
    depot: Depot,
    optimized: RoutePlan,
    baseline: RoutePlan,
    question: str | None = None,
) -> str:
    data = {
        "depot": depot.name,
        "optimized": plan_as_dict(optimized),
        "nearest_neighbor_baseline": plan_as_dict(baseline),
    }
    task = (
        "Responda somente a pergunta do usuario usando os dados fornecidos."
        if question
        else (
            "Gere instrucoes objetivas por veiculo, um resumo diario de eficiencia "
            "comparando com a referencia e tres melhorias praticas. Avalie distancia "
            "e ocupacao da capacidade como indicadores de uso de recursos. Nao estime "
            "economia de tempo porque nao existem dados de duracao."
        )
    )
    return (
        "Voce auxilia a logistica de medicamentos de um hospital. "
        "Prioridade 3 significa entrega critica. Nao invente ruas, tempos ou dados. "
        f"{task}\n\n"
        + (f"Pergunta: {question}\n\n" if question else "")
        + "Dados:\n"
        + json.dumps(data, ensure_ascii=False, indent=2)
    )


def local_report(optimized: RoutePlan, baseline: RoutePlan) -> str:
    distance_delta = optimized.total_distance - baseline.total_distance
    fitness_improvement = baseline.fitness - optimized.fitness
    priority_improvement = baseline.priority_penalty - optimized.priority_penalty
    total_load = sum(route.load for route in optimized.routes)
    total_capacity = sum(route.vehicle.capacity for route in optimized.routes)
    capacity_utilization = 100 * total_load / total_capacity
    lines = [
        "RELATORIO DIARIO DE ROTAS",
        "",
        f"Distancia otimizada: {optimized.total_distance:.2f} km",
        f"Referencia (vizinho mais proximo): {baseline.total_distance:.2f} km",
        f"Variacao de distancia: {distance_delta:+.2f} km",
        f"Melhoria de fitness: {fitness_improvement:.2f} pontos",
        f"Reducao da penalidade de prioridade: {priority_improvement:.2f} pontos",
        f"Ocupacao da capacidade total: {capacity_utilization:.2f}%",
        f"Plano viavel: {'sim' if optimized.feasible else 'nao'}",
        "",
    ]
    for route in optimized.routes:
        sequence = " -> ".join(item.name for item in route.deliveries) or "sem entregas"
        lines.extend(
            [
                f"{route.vehicle.id}: Hospital Central -> {sequence} -> Hospital Central",
                f"Carga: {route.load:.1f}/{route.vehicle.capacity:.1f}; "
                f"distancia: {route.distance:.2f}/{route.vehicle.max_distance:.2f} km",
                "",
            ]
        )
    lines.extend(
        [
            "Tempo economizado: nao calculado, pois o cenario nao possui dados de duracao.",
            "Use --llm para gerar instrucoes detalhadas com a LLM.",
        ]
    )
    return "\n".join(lines)


def generate_llm_text(prompt: str) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("Defina OPENROUTER_API_KEY para usar --llm")
    try:
        from openai import OpenAI
    except ImportError as error:
        raise RuntimeError("Instale a integracao com: pip install -e '.[llm]'") from error

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )
    response = client.chat.completions.create(
        model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
    )
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("A OpenRouter retornou uma resposta vazia")
    return content
