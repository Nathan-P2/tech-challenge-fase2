from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Iterable, Sequence

from .models import Delivery, Depot, RoutePlan, Vehicle, VehicleRoute


def distance(a: Depot | Delivery, b: Depot | Delivery) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def route_distance(depot: Depot, deliveries: Sequence[Delivery]) -> float:
    if not deliveries:
        return 0.0
    points: list[Depot | Delivery] = [depot, *deliveries, depot]
    return sum(distance(a, b) for a, b in zip(points, points[1:]))


def order_crossover(
    parent1: Sequence[str], parent2: Sequence[str], rng: random.Random
) -> list[str]:
    """Order crossover (OX), preservando uma permutacao valida."""
    if len(parent1) != len(parent2) or set(parent1) != set(parent2):
        raise ValueError("Os pais devem conter os mesmos genes")
    if len(parent1) < 2:
        return list(parent1)

    start, end = sorted(rng.sample(range(len(parent1) + 1), 2))
    if start == end:
        end = min(len(parent1), start + 1)
    child: list[str | None] = [None] * len(parent1)
    child[start:end] = parent1[start:end]
    remaining = [gene for gene in parent2 if gene not in child]
    positions = list(range(end, len(parent1))) + list(range(0, start))
    for position, gene in zip(positions, remaining):
        child[position] = gene
    return [gene for gene in child if gene is not None]


def swap_mutation(
    genome: Sequence[str], probability: float, rng: random.Random
) -> list[str]:
    mutated = list(genome)
    if len(mutated) >= 2 and rng.random() < probability:
        first, second = rng.sample(range(len(mutated)), 2)
        mutated[first], mutated[second] = mutated[second], mutated[first]
    return mutated


@dataclass(frozen=True)
class OptimizationResult:
    plan: RoutePlan
    genome: tuple[str, ...]
    history: tuple[float, ...]


class GeneticRouteOptimizer:
    def __init__(
        self,
        depot: Depot,
        deliveries: Iterable[Delivery],
        vehicles: Iterable[Vehicle],
        *,
        population_size: int = 120,
        generations: int = 250,
        mutation_probability: float = 0.25,
        elite_size: int = 2,
        seed: int = 42,
    ) -> None:
        self.depot = depot
        self.deliveries = tuple(deliveries)
        self.vehicles = tuple(vehicles)
        self.population_size = population_size
        self.generations = generations
        self.mutation_probability = mutation_probability
        self.elite_size = elite_size
        self.rng = random.Random(seed)
        self._by_id = {delivery.id: delivery for delivery in self.deliveries}

        if not self.deliveries or not self.vehicles:
            raise ValueError("Informe entregas e veiculos")
        if len(self._by_id) != len(self.deliveries):
            raise ValueError("Os identificadores das entregas devem ser unicos")
        if population_size < 4 or generations < 1:
            raise ValueError("Populacao minima 4 e ao menos uma geracao")
        if not 0 <= mutation_probability <= 1:
            raise ValueError("A probabilidade de mutacao deve estar entre 0 e 1")
        if not 1 <= elite_size < population_size:
            raise ValueError("Elite invalida")

    def decode(self, genome: Sequence[str]) -> RoutePlan:
        if len(genome) != len(self.deliveries) or set(genome) != set(self._by_id):
            raise ValueError("O genoma deve conter cada entrega exatamente uma vez")

        allocated: list[list[Delivery]] = [[] for _ in self.vehicles]
        vehicle_index = 0

        for delivery_id in genome:
            delivery = self._by_id[delivery_id]
            while vehicle_index < len(self.vehicles) - 1:
                vehicle = self.vehicles[vehicle_index]
                candidate = [*allocated[vehicle_index], delivery]
                candidate_load = sum(item.demand for item in candidate)
                if (
                    candidate_load <= vehicle.capacity
                    and route_distance(self.depot, candidate) <= vehicle.max_distance
                ):
                    break
                vehicle_index += 1
            allocated[vehicle_index].append(delivery)

        routes: list[VehicleRoute] = []
        total_distance = 0.0
        overload = 0.0
        autonomy_excess = 0.0
        priority_penalty = 0.0
        global_position = 0

        for vehicle, items in zip(self.vehicles, allocated):
            load = sum(item.demand for item in items)
            travelled = route_distance(self.depot, items)
            total_distance += travelled
            overload += max(0.0, load - vehicle.capacity)
            autonomy_excess += max(0.0, travelled - vehicle.max_distance)
            for item in items:
                priority_penalty += global_position * item.priority
                global_position += 1
            routes.append(
                VehicleRoute(vehicle, tuple(items), load=load, distance=travelled)
            )

        fitness = (
            total_distance
            + 4.0 * priority_penalty
            + 1_000.0 * overload
            + 1_000.0 * autonomy_excess
        )
        return RoutePlan(
            routes=tuple(routes),
            total_distance=total_distance,
            priority_penalty=priority_penalty,
            overload=overload,
            autonomy_excess=autonomy_excess,
            fitness=fitness,
        )

    def nearest_neighbor_genome(self) -> list[str]:
        remaining = list(self.deliveries)
        current: Depot | Delivery = self.depot
        genome: list[str] = []
        while remaining:
            selected = min(remaining, key=lambda item: distance(current, item))
            genome.append(selected.id)
            remaining.remove(selected)
            current = selected
        return genome

    def _tournament(self, ranked: Sequence[tuple[float, list[str]]]) -> list[str]:
        competitors = self.rng.sample(list(ranked), k=min(4, len(ranked)))
        return min(competitors, key=lambda item: item[0])[1]

    def optimize(self) -> OptimizationResult:
        genes = list(self._by_id)
        population = [
            self.rng.sample(genes, len(genes)) for _ in range(self.population_size)
        ]
        population[0] = self.nearest_neighbor_genome()
        history: list[float] = []

        for _ in range(self.generations):
            ranked = sorted(
                ((self.decode(genome).fitness, genome) for genome in population),
                key=lambda item: item[0],
            )
            history.append(ranked[0][0])
            next_population = [list(genome) for _, genome in ranked[: self.elite_size]]
            while len(next_population) < self.population_size:
                parent1 = self._tournament(ranked)
                parent2 = self._tournament(ranked)
                child = order_crossover(parent1, parent2, self.rng)
                next_population.append(
                    swap_mutation(child, self.mutation_probability, self.rng)
                )
            population = next_population

        final_ranked = sorted(
            ((self.decode(genome).fitness, genome) for genome in population),
            key=lambda item: item[0],
        )
        best_genome = final_ranked[0][1]
        best_plan = self.decode(best_genome)
        history.append(best_plan.fitness)
        return OptimizationResult(best_plan, tuple(best_genome), tuple(history))

