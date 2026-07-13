import random
import unittest

from hospital_routes.data import sample_problem
from hospital_routes.models import Delivery, Depot, Vehicle
from hospital_routes.optimizer import (
    GeneticRouteOptimizer,
    order_crossover,
    swap_mutation,
)


class GeneticOperatorsTest(unittest.TestCase):
    def test_order_crossover_preserves_permutation(self) -> None:
        parent1 = list("ABCDEFGH")
        parent2 = list(reversed(parent1))
        child = order_crossover(parent1, parent2, random.Random(7))
        self.assertEqual(len(child), len(parent1))
        self.assertEqual(set(child), set(parent1))

    def test_mutation_preserves_permutation(self) -> None:
        genome = list("ABCDE")
        mutated = swap_mutation(genome, 1.0, random.Random(2))
        self.assertEqual(set(mutated), set(genome))
        self.assertNotEqual(mutated, genome)


class OptimizerTest(unittest.TestCase):
    def setUp(self) -> None:
        depot, deliveries, vehicles = sample_problem()
        self.optimizer = GeneticRouteOptimizer(
            depot,
            deliveries,
            vehicles,
            population_size=50,
            generations=60,
            mutation_probability=0.3,
            seed=42,
        )

    def test_result_visits_every_delivery_once(self) -> None:
        result = self.optimizer.optimize()
        visited = [
            delivery.id
            for route in result.plan.routes
            for delivery in route.deliveries
        ]
        self.assertEqual(len(visited), len(set(visited)))
        self.assertEqual(set(visited), set(self.optimizer._by_id))

    def test_elitism_does_not_worsen_best_fitness(self) -> None:
        result = self.optimizer.optimize()
        self.assertLessEqual(result.history[-1], result.history[0])

    def test_sample_problem_has_feasible_solution(self) -> None:
        result = self.optimizer.optimize()
        self.assertTrue(result.plan.feasible)


class HospitalConstraintsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.depot = Depot("Hospital", 0, 0)

    def optimizer(
        self, deliveries: list[Delivery], vehicles: list[Vehicle]
    ) -> GeneticRouteOptimizer:
        return GeneticRouteOptimizer(
            self.depot,
            deliveries,
            vehicles,
            population_size=4,
            generations=1,
            seed=1,
        )

    def test_excess_load_is_measured_and_penalized(self) -> None:
        deliveries = [
            Delivery("A", "Entrega A", 1, 0, demand=4, priority=1),
            Delivery("B", "Entrega B", 2, 0, demand=4, priority=1),
        ]
        vehicle = Vehicle("V1", capacity=5, max_distance=100)

        plan = self.optimizer(deliveries, [vehicle]).decode(["A", "B"])

        self.assertEqual(plan.routes[0].load, 8)
        self.assertEqual(plan.overload, 3)
        self.assertFalse(plan.feasible)
        self.assertGreaterEqual(plan.fitness, 3_000)

    def test_autonomy_excess_is_measured_and_penalized(self) -> None:
        delivery = Delivery("A", "Entrega distante", 3, 4, demand=1, priority=1)
        vehicle = Vehicle("V1", capacity=10, max_distance=8)

        plan = self.optimizer([delivery], [vehicle]).decode(["A"])

        self.assertEqual(plan.routes[0].distance, 10)
        self.assertEqual(plan.autonomy_excess, 2)
        self.assertFalse(plan.feasible)
        self.assertGreaterEqual(plan.fitness, 2_000)

    def test_deliveries_are_divided_between_available_vehicles(self) -> None:
        deliveries = [
            Delivery("A", "Entrega A", 1, 0, demand=4, priority=1),
            Delivery("B", "Entrega B", 2, 0, demand=4, priority=1),
        ]
        vehicles = [
            Vehicle("V1", capacity=5, max_distance=100),
            Vehicle("V2", capacity=5, max_distance=100),
        ]

        plan = self.optimizer(deliveries, vehicles).decode(["A", "B"])

        self.assertEqual(
            [[item.id for item in route.deliveries] for route in plan.routes],
            [["A"], ["B"]],
        )
        self.assertEqual([route.load for route in plan.routes], [4, 4])
        self.assertTrue(plan.feasible)

    def test_critical_delivery_first_has_lower_priority_penalty(self) -> None:
        deliveries = [
            Delivery("C", "Medicamento critico", 1, 0, demand=1, priority=3),
            Delivery("R", "Insumo regular", 1, 0, demand=1, priority=1),
        ]
        vehicle = Vehicle("V1", capacity=10, max_distance=100)
        optimizer = self.optimizer(deliveries, [vehicle])

        critical_first = optimizer.decode(["C", "R"])
        critical_last = optimizer.decode(["R", "C"])

        self.assertEqual(critical_first.total_distance, critical_last.total_distance)
        self.assertEqual(critical_first.priority_penalty, 1)
        self.assertEqual(critical_last.priority_penalty, 3)
        self.assertLess(critical_first.fitness, critical_last.fitness)


if __name__ == "__main__":
    unittest.main()
