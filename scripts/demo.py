from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Executa tres configuracoes e gera os artefatos de demonstracao"
    )
    parser.add_argument("--output", type=Path, default=ROOT / "output" / "demo")
    parser.add_argument("--llm", action="store_true", help="Usa OpenRouter na ultima execucao")
    parser.add_argument(
        "--report-type",
        choices=("daily", "weekly"),
        default="weekly",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    configurations = (
        (80, 120, 0.20, 7),
        (100, 180, 0.35, 19),
        (120, 250, 0.25, 42),
    )
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(SRC)

    for index, (population, generations, mutation, seed) in enumerate(
        configurations, start=1
    ):
        command = [
            sys.executable,
            "-m",
            "hospital_routes",
            "--population",
            str(population),
            "--generations",
            str(generations),
            "--mutation",
            str(mutation),
            "--seed",
            str(seed),
            "--output",
            str(args.output),
            "--report-type",
            args.report_type,
        ]
        if args.llm and index == len(configurations):
            command.append("--llm")
        print(f"Experimento {index}/{len(configurations)}", flush=True)
        subprocess.run(command, cwd=ROOT, env=environment, check=True)

    print(f"Demonstracao concluida: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
