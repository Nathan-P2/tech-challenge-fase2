import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from hospital_routes.data import sample_problem
from hospital_routes.optimizer import GeneticRouteOptimizer
from hospital_routes.reporting import (
    build_prompt,
    generate_llm_text,
    local_report,
    plan_as_dict,
    time_comparison,
)
from hospital_routes.visualization import render_svg


class OutputTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.depot, deliveries, vehicles = sample_problem()
        cls.optimizer = GeneticRouteOptimizer(
            cls.depot,
            deliveries,
            vehicles,
            population_size=30,
            generations=20,
            seed=10,
        )
        cls.baseline = cls.optimizer.decode(cls.optimizer.nearest_neighbor_genome())
        cls.plan = cls.optimizer.optimize().plan

    def test_prompt_contains_routes_and_question(self) -> None:
        prompt = build_prompt(
            self.depot, self.plan, self.baseline, "Qual entrega e critica?"
        )
        self.assertIn("Qual entrega e critica?", prompt)
        self.assertIn('"routes"', prompt)
        self.assertIn("Prioridade 3", prompt)
        self.assertIn('"time_comparison"', prompt)
        self.assertIn('"execution_history"', prompt)

    def test_local_report_contains_vehicle_instructions(self) -> None:
        report = local_report(self.plan, self.baseline)
        self.assertIn("V1", report)
        self.assertIn("Hospital Central", report)
        self.assertIn("Ocupacao da capacidade total", report)
        self.assertIn("Economia estimada de tempo", report)
        self.assertIn("Premissas de tempo", report)

    def test_summary_contains_resource_utilization(self) -> None:
        data = plan_as_dict(self.plan)
        self.assertIn("capacity_utilization_percent", data)
        self.assertGreater(data["capacity_utilization_percent"], 0)
        self.assertLessEqual(data["capacity_utilization_percent"], 100)
        self.assertIn("estimated_time", data)

    def test_time_comparison_uses_explicit_assumptions(self) -> None:
        comparison = time_comparison(self.plan, self.baseline)
        self.assertIn("time_saved_minutes", comparison)
        self.assertGreater(comparison["baseline_completion_minutes"], 0)
        self.assertGreater(comparison["optimized_completion_minutes"], 0)

    def test_weekly_report_uses_history(self) -> None:
        history = [
            {
                "executed_at": datetime.now(timezone.utc).isoformat(),
                "fitness": 400,
                "total_distance_km": 80,
                "estimated_completion_minutes": 90,
                "time_saved_vs_baseline_minutes": -5,
            },
            {
                "executed_at": datetime.now(timezone.utc).isoformat(),
                "fitness": 380,
                "total_distance_km": 78,
                "estimated_completion_minutes": 85,
                "time_saved_vs_baseline_minutes": 2,
            },
        ]
        prompt = build_prompt(
            self.depot,
            self.plan,
            self.baseline,
            history=history,
            report_type="weekly",
        )
        report = local_report(
            self.plan,
            self.baseline,
            report_type="weekly",
            history=history,
        )

        self.assertIn("relatorio semanal consolidado", prompt)
        self.assertIn("quantidade e prioridade", prompt)
        self.assertIn('"report_type": "weekly"', prompt)
        self.assertIn("RELATORIO SEMANAL", report)
        self.assertIn("Execucoes analisadas: 2", report)
        self.assertIn("Fitness medio: 390.00", report)

    def test_rejects_unknown_report_type(self) -> None:
        with self.assertRaises(ValueError):
            build_prompt(
                self.depot,
                self.plan,
                self.baseline,
                report_type="monthly",
            )

    def test_svg_contains_route_map(self) -> None:
        svg = render_svg(self.depot, self.plan)
        self.assertIn("<svg", svg)
        self.assertIn("UPA Norte", svg)
        self.assertIn("polyline", svg)

    def test_openrouter_configuration(self) -> None:
        captured = {}

        class FakeCompletions:
            def create(self, **kwargs):
                captured["request"] = kwargs
                return SimpleNamespace(
                    choices=[SimpleNamespace(message=SimpleNamespace(content="relatorio"))]
                )

        class FakeOpenAI:
            def __init__(self, **kwargs):
                captured["client"] = kwargs
                self.chat = SimpleNamespace(completions=FakeCompletions())

        fake_module = SimpleNamespace(OpenAI=FakeOpenAI)
        with (
            patch.dict("os.environ", {"OPENROUTER_API_KEY": "teste"}, clear=True),
            patch.dict("sys.modules", {"openai": fake_module}),
        ):
            result = generate_llm_text("prompt")

        self.assertEqual(result, "relatorio")
        self.assertEqual(captured["client"]["api_key"], "teste")
        self.assertEqual(
            captured["client"]["base_url"], "https://openrouter.ai/api/v1"
        )
        self.assertEqual(captured["request"]["model"], "openai/gpt-4o-mini")


if __name__ == "__main__":
    unittest.main()
