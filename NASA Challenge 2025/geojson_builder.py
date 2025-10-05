from math import cos, sin, pi
from typing import Dict, List, Tuple

__all__ = [
    "feature_collection_basic",
    "circle_polygon_wgs84_basic",
]

def _meters_to_deg_local(lat_deg: float, dx_m: float, dy_m: float) -> Tuple[float, float]: 
    lat_rad = lat_deg * pi / 180.0
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = max(1e-9, 111_320.0 * cos(lat_rad)) 
    dlat = dy_m / m_per_deg_lat
    dlon = dx_m / m_per_deg_lon
    return dlat, dlon

def circle_polygon_wgs84_basic(lat: float, lon: float, radius_m: float, steps: int = 128) -> Dict: 
    if radius_m <= 0:
        raise ValueError("El radio debe ser > 0") 
    coords: List[List[float]] = []
    for i in range(steps + 1):
        t = 2 * pi * (i / steps)
        dx = radius_m * cos(t)  # Este-Oeste (m)
        dy = radius_m * sin(t)  # Norte-Sur (m)
        dlat, dlon = _meters_to_deg_local(lat, dx, dy)
        coords.append([lon + dlon, lat + dlat])  # [lon, lat]
    return {"type": "Polygon", "coordinates": [coords]}

def feature_collection_basic(
    lat: float,
    lon: float,
    crater_radius_m: float,
    rings_m: Dict[str, float],
    steps: int = 128
) -> Dict:
    fc = {"type": "FeatureCollection", "features": []}

    fc["features"].append({
        "type": "Feature",
        "properties": {"kind": "impact_point"},
        "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
    })

    if crater_radius_m and crater_radius_m > 0:
        fc["features"].append({
            "type": "Feature",
            "properties": {"kind": "crater", "radius_m": float(crater_radius_m)},
            "geometry": circle_polygon_wgs84_basic(lat, lon, float(crater_radius_m), steps),
        })

    for label in ["10psi", "5psi", "3psi", "1psi"]:
        r = rings_m.get(label)
        if r and r > 0:
            fc["features"].append({
                "type": "Feature",
                "properties": {"kind": "overpressure", "label": label, "radius_m": float(r)},
                "geometry": circle_polygon_wgs84_basic(lat, lon, float(r), steps),
            })

    return fc