def validate_sim_payload(p: dict) -> None:
    if "neo_id" in p:
        required = ["lat", "lon", "density_kg_m3", "neo_id"]
    else:
        required = ["lat", "lon", "diameter_m", "density_kg_m3", "velocity_kms"]

    for k in required:
        if k not in p:
            raise ValueError(f"falta '{k}'")

    lat = float(p["lat"])
    lon = float(p["lon"])
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise ValueError("lat/lon inválidos")

    if "angle_deg" in p:
        ang = float(p["angle_deg"])
        if not (5.0 <= ang <= 85.0):
            raise ValueError("angle_deg fuera de rango (5–85)")

    if "diameter_m" in p and float(p["diameter_m"]) <= 0:
        raise ValueError("diameter_m debe ser > 0")
    if "density_kg_m3" in p and float(p["density_kg_m3"]) <= 0:
        raise ValueError("density_kg_m3 debe ser > 0")
    if "velocity_kms" in p and float(p["velocity_kms"]) <= 0:
        raise ValueError("velocity_kms debe ser > 0")