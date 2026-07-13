from .models import Delivery, Depot, Vehicle


def sample_problem() -> tuple[Depot, list[Delivery], list[Vehicle]]:
    depot = Depot("Hospital Central", 0, 0)
    deliveries = [
        Delivery("U01", "UPA Norte", 2, 8, 4, 3),
        Delivery("U02", "Clinica Leste", 7, 5, 3, 2),
        Delivery("U03", "UBS Jardim", 5, 1, 2, 1),
        Delivery("U04", "Paciente Ana", -3, 7, 2, 3),
        Delivery("U05", "Paciente Bruno", -6, 4, 3, 2),
        Delivery("U06", "UBS Sul", -4, -5, 4, 1),
        Delivery("U07", "Clinica Oeste", -8, -1, 3, 1),
        Delivery("U08", "Paciente Carla", 3, -6, 2, 3),
        Delivery("U09", "Pronto Atendimento", 8, -3, 4, 3),
        Delivery("U10", "Laboratorio Regional", 1, 4, 3, 2),
    ]
    vehicles = [
        Vehicle("V1", capacity=12, max_distance=30),
        Vehicle("V2", capacity=12, max_distance=30),
        Vehicle("V3", capacity=12, max_distance=30),
    ]
    return depot, deliveries, vehicles

