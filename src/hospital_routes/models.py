from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Depot:
    name: str
    x: float
    y: float


@dataclass(frozen=True)
class Delivery:
    id: str
    name: str
    x: float
    y: float
    demand: float
    priority: int

    def __post_init__(self) -> None:
        if self.demand <= 0:
            raise ValueError("A demanda deve ser positiva")
        if self.priority not in (1, 2, 3):
            raise ValueError("A prioridade deve ser 1, 2 ou 3")


@dataclass(frozen=True)
class Vehicle:
    id: str
    capacity: float
    max_distance: float

    def __post_init__(self) -> None:
        if self.capacity <= 0 or self.max_distance <= 0:
            raise ValueError("Capacidade e autonomia devem ser positivas")


@dataclass(frozen=True)
class VehicleRoute:
    vehicle: Vehicle
    deliveries: tuple[Delivery, ...]
    load: float
    distance: float


@dataclass(frozen=True)
class RoutePlan:
    routes: tuple[VehicleRoute, ...]
    total_distance: float
    priority_penalty: float
    overload: float
    autonomy_excess: float
    fitness: float

    @property
    def feasible(self) -> bool:
        return self.overload == 0 and self.autonomy_excess == 0

