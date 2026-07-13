from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .data import sample_problem
from .optimizer import GeneticRouteOptimizer
from .reporting import (
    build_prompt,
    generate_llm_text,
    local_report,
    plan_as_dict,
)
from .visualization import save_svg


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Otimizacao de rotas hospitalares")
    parser.add_argument("--population", type=int, default=120)
    parser.add_argument("--generations", type=int, default=250)
    parser.add_argument("--mutation", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=Path("output"))
    parser.add_argument("--llm", action="store_true", help="Chama a API da OpenRouter")
    parser.add_argument("--question", help="Pergunta em linguagem natural sobre as rotas")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    depot, deliveries, vehicles = sample_problem()
    optimizer = GeneticRouteOptimizer(
        depot,
        deliveries,
        vehicles,
        population_size=args.population,
        generations=args.generations,
        mutation_probability=args.mutation,
        seed=args.seed,
    )

    baseline = optimizer.decode(optimizer.nearest_neighbor_genome())
    result = optimizer.optimize()
    optimized = result.plan
    args.output.mkdir(parents=True, exist_ok=True)

    prompt = build_prompt(depot, optimized, baseline, args.question)
    report = generate_llm_text(prompt) if args.llm else local_report(optimized, baseline)
    summary = {
        "configuration": {
            "population": args.population,
            "generations": args.generations,
            "mutation_probability": args.mutation,
            "seed": args.seed,
        },
        "optimized": plan_as_dict(optimized),
        "nearest_neighbor_baseline": plan_as_dict(baseline),
        "distance_delta_km": round(
            optimized.total_distance - baseline.total_distance, 2
        ),
        "fitness_improvement": round(baseline.fitness - optimized.fitness, 2),
        "priority_penalty_improvement": round(
            baseline.priority_penalty - optimized.priority_penalty, 2
        ),
        "fitness_history": [round(value, 2) for value in result.history],
    }

    (args.output / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output / "llm_prompt.txt").write_text(prompt, encoding="utf-8")
    (args.output / "report.txt").write_text(report, encoding="utf-8")
    save_svg(args.output / "routes.svg", depot, optimized)

    print(f"Plano viavel: {'sim' if optimized.feasible else 'nao'}")
    print(f"Distancia otimizada: {optimized.total_distance:.2f} km")
    print(f"Vizinho mais proximo: {baseline.total_distance:.2f} km")
    print(f"Arquivos gerados em: {args.output.resolve()}")
    return 0
