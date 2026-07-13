from __future__ import annotations

from html import escape
from pathlib import Path

from .models import Depot, RoutePlan


COLORS = ("#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c")


def render_svg(depot: Depot, plan: RoutePlan, width: int = 900, height: int = 650) -> str:
    deliveries = [item for route in plan.routes for item in route.deliveries]
    xs = [depot.x, *(item.x for item in deliveries)]
    ys = [depot.y, *(item.y for item in deliveries)]
    padding = 80
    x_span = max(xs) - min(xs) or 1
    y_span = max(ys) - min(ys) or 1

    def point(x: float, y: float) -> tuple[float, float]:
        px = padding + (x - min(xs)) / x_span * (width - 2 * padding)
        py = height - padding - (y - min(ys)) / y_span * (height - 2 * padding)
        return px, py

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#f8fafc"/>',
        '<text x="30" y="38" font-family="Arial" font-size="24" font-weight="bold">Rotas hospitalares otimizadas</text>',
    ]
    for index, route in enumerate(plan.routes):
        if not route.deliveries:
            continue
        color = COLORS[index % len(COLORS)]
        route_points = [depot, *route.deliveries, depot]
        coordinates = " ".join(
            f"{point(item.x, item.y)[0]:.1f},{point(item.x, item.y)[1]:.1f}"
            for item in route_points
        )
        parts.append(
            f'<polyline points="{coordinates}" fill="none" stroke="{color}" stroke-width="4" stroke-linejoin="round"/>'
        )
        parts.append(
            f'<text x="{width - 190}" y="{70 + index * 24}" fill="{color}" font-family="Arial" font-size="15">{escape(route.vehicle.id)} - {route.distance:.1f} km</text>'
        )

    depot_x, depot_y = point(depot.x, depot.y)
    parts.extend(
        [
            f'<rect x="{depot_x - 9:.1f}" y="{depot_y - 9:.1f}" width="18" height="18" fill="#111827"/>',
            f'<text x="{depot_x + 13:.1f}" y="{depot_y - 12:.1f}" font-family="Arial" font-size="14" font-weight="bold">{escape(depot.name)}</text>',
        ]
    )
    priority_colors = {1: "#94a3b8", 2: "#f59e0b", 3: "#ef4444"}
    for item in deliveries:
        x, y = point(item.x, item.y)
        parts.extend(
            [
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{priority_colors[item.priority]}" stroke="#ffffff" stroke-width="2"/>',
                f'<text x="{x + 11:.1f}" y="{y + 5:.1f}" font-family="Arial" font-size="13">{escape(item.name)} (P{item.priority})</text>',
            ]
        )
    parts.append("</svg>")
    return "\n".join(parts)


def save_svg(path: Path, depot: Depot, plan: RoutePlan) -> None:
    path.write_text(render_svg(depot, plan), encoding="utf-8")

