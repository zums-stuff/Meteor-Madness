import os
import math
import requests
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from geojson_builder import feature_collection_basic
from validators import validate_sim_payload

# ---------------------------
# Config
# ---------------------------
load_dotenv()

API_KEY = os.getenv("NASA_API_KEY", "")
PORT = int(os.getenv("PORT", "8000"))
EPQS_URL = "https://epqs.nationalmap.gov/v1/json"

# ---------------------------
# HTTP session with retries
# ---------------------------
def _make_session():
    s = requests.Session()
    retries = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.7,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET"])
    )
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    return s

SESSION = _make_session()

# ---------------------------
# Flask
# ---------------------------
app = Flask(__name__)
CORS(app)

# ---------------------------
# Helpers
# ---------------------------
def us_elevation_m_or_none(lat: float, lon: float):
    """USGS Elevation Point Query Service (EPSG:4326). None si fuera de cobertura/agua/error."""
    try:
        params = {"x": lon, "y": lat, "units": "Meters", "wkid": 4326}
        r = SESSION.get(EPQS_URL, params=params, timeout=8)
        r.raise_for_status()
        data = r.json()

        elevation_val = None
        if isinstance(data, dict):
            try:
                elevation_val = data["USGS_Elevation_Point_Query_Service"]["Elevation_Query"]["Elevation"]
            except (KeyError, TypeError):
                elevation_val = data.get("value") or data.get("elevation")

        if elevation_val is None:
            return None

        if isinstance(elevation_val, (int, float)) and elevation_val < -100000:
            return None

        try:
            return float(elevation_val)
        except (ValueError, TypeError):
            return None

    except requests.exceptions.RequestException:
        return None
    except Exception:
        return None


def mass_from_diameter(d_m, rho):
    r = d_m / 2.0
    V = (4.0 / 3.0) * math.pi * (r ** 3)
    return rho * V


def energy_joules(m_kg, v_ms):
    return 0.5 * m_kg * (v_ms ** 2)


def joules_to_megatons(E_J):
    return E_J / 4.184e15


def crater_radius_m(E_Mt, angle_deg):
    # Modelo simple (calibrado al hackathon): escalado por energía y ángulo
    k = 120.0
    th = math.radians(angle_deg)
    return k * (E_Mt ** 0.25) * (math.sin(th) ** (1.0 / 3.0))


def blast_rings_m(E_Mt, angle_deg):
    # Radios aproximados (m) para isóbaras de 10/5/3/1 psi
    th = math.radians(angle_deg)
    s = math.sin(th)
    base = E_Mt ** (1.0 / 3.0)
    coeff = {"10psi": 0.55 * 900, "5psi": 0.85 * 900, "3psi": 1.1 * 900, "1psi": 1.6 * 900}
    return {k: c * base * s for k, c in coeff.items()}

# ---------------------------
# Data providers: NeoWs (NASA), SBDB+CAD (JPL) fallback
# ---------------------------
def fetch_neows(neo_id):
    if not API_KEY:
        raise RuntimeError("NASA_API_KEY no configurada")
    url = "https://api.nasa.gov/neo/rest/v1/neo/{}".format(neo_id)
    r = SESSION.get(url, params={"api_key": API_KEY}, timeout=8)
    r.raise_for_status()
    return r.json()


def params_from_neows(data, density_kg_m3):
    # diámetro promedio (m)
    dmin = float(data["estimated_diameter"]["meters"]["estimated_diameter_min"])
    dmax = float(data["estimated_diameter"]["meters"]["estimated_diameter_max"])
    diameter_m = (dmin + dmax) / 2.0

    # velocidad (km/s): toma primer acercamiento si existe; si no, None
    velocity_kms = None
    ca = data.get("close_approach_data", [])
    if ca:
        try:
            velocity_kms = float(ca[0]["relative_velocity"]["kilometers_per_second"])
        except Exception:
            velocity_kms = None

    return diameter_m, float(density_kg_m3), velocity_kms


def fetch_sbdb(ident):
    url = "https://ssd-api.jpl.nasa.gov/sbdb/api"
    r = SESSION.get(url, params={"sstr": str(ident)}, timeout=8)
    r.raise_for_status()
    return r.json()


def fetch_cad_velocity_kms(ident):
    # Close-Approach Data: v_rel en km/s
    url = "https://ssd-api.jpl.nasa.gov/cad.api"
    r = SESSION.get(url, params={"sstr": str(ident), "limit": 1}, timeout=8)
    r.raise_for_status()
    data = r.json()
    arr = data.get("data") or []
    if not arr:
        return None
    try:
        return float(arr[0][7])  # v_rel km/s
    except Exception:
        return None


def params_from_sbdb_and_cad(sbdb, density_kg_m3, ident):
    # diámetro (m) desde SBDB si está disponible (SBDB usualmente da km)
    diameter_m = None
    try:
        phys = sbdb.get("phys_par") or {}
        d_km = phys.get("diameter")
        if d_km is not None:
            diameter_m = float(d_km) * 1000.0
    except Exception:
        diameter_m = None

    # velocidad (km/s) desde CAD si hay
    velocity_kms = fetch_cad_velocity_kms(ident)

    if diameter_m is None:
        raise ValueError("SBDB no tiene diámetro para este objeto")
    if velocity_kms is None:
        # default razonable
        velocity_kms = 19.0

    return diameter_m, float(density_kg_m3), float(velocity_kms)

# ---------------------------
# Endpoints
# ---------------------------
@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/simulate")
def simulate():
    try:
        payload = request.get_json(force=True)
        validate_sim_payload(payload)

        lat = float(payload["lat"])
        lon = float(payload["lon"])

        elev_m = us_elevation_m_or_none(lat, lon)
        if elev_m is None:
            return jsonify({"error": "Only continental U.S. allowed (no coverage outside the U.S.)."}), 400
        if elev_m <= 0:
            return jsonify({"error": "Selected point is over water (elevation ≤ 0 m). Choose land in the U.S."}), 400

        angle_deg = float(payload.get("angle_deg", 45.0))
        client_name = payload.get("name")

        # --- Obtener parámetros (manual vs NEO ID con fallback) ---
        if "neo_id" in payload:
            density_kg_m3 = float(payload["density_kg_m3"])
            neo_id = str(payload["neo_id"])
            meta_name = client_name

            try:
                # 1) Intenta NeoWs
                data = fetch_neows(neo_id)
                diameter_m, density_kg_m3, velocity_kms = params_from_neows(data, density_kg_m3)
                if not meta_name:
                    meta_name = data.get("name")
                # Si NeoWs no trae velocidad, intenta CAD
                if velocity_kms is None:
                    v_fallback = fetch_cad_velocity_kms(neo_id)
                    velocity_kms = v_fallback if v_fallback is not None else 19.0

            except (requests.Timeout, requests.exceptions.ReadTimeout):
                # 2) Timeout: SBDB + CAD
                try:
                    sbdb = fetch_sbdb(neo_id)
                    diameter_m, density_kg_m3, velocity_kms = params_from_sbdb_and_cad(sbdb, density_kg_m3, neo_id)
                    if not meta_name:
                        meta_name = (sbdb.get("object") or {}).get("fullname") or (sbdb.get("object") or {}).get("des")
                except Exception:
                    return jsonify({"error": "NeoWs timeout and SBDB/CAD unavailable. Use Manual mode or try again."}), 504
            except requests.HTTPError as he:
                code = he.response.status_code if he.response is not None else 502
                return jsonify({"error": f"NeoWs HTTP {code}. Try Manual mode or retry."}), 502
            except Exception:
                # 3) Otros errores: intenta SBDB + CAD
                try:
                    sbdb = fetch_sbdb(neo_id)
                    diameter_m, density_kg_m3, velocity_kms = params_from_sbdb_and_cad(sbdb, density_kg_m3, neo_id)
                    if not meta_name:
                        meta_name = (sbdb.get("object") or {}).get("fullname") or (sbdb.get("object") or {}).get("des")
                except Exception as e2:
                    return jsonify({"error": f"Could not fetch NEO data ({e2}). Use Manual mode."}), 502

        else:
            # Manual
            diameter_m = float(payload["diameter_m"])
            density_kg_m3 = float(payload["density_kg_m3"])
            velocity_kms = float(payload["velocity_kms"])
            meta_name = client_name

        # --- Física / KPIs ---
        v_ms = velocity_kms * 1000.0
        m_kg = mass_from_diameter(diameter_m, density_kg_m3)
        E_J = energy_joules(m_kg, v_ms)
        E_Mt = joules_to_megatons(E_J)
        crater = crater_radius_m(E_Mt, angle_deg)
        rings = blast_rings_m(E_Mt, angle_deg)

        # --- GeoJSON footprint ---
        fc = feature_collection_basic(lat, lon, crater, rings, steps=128)

        # --- Serie temporal (simple) ---
        time_series = []
        # Usaremos la serie para animación y la escalaremos en front; aquí basta un crecimiento suave
        sound_speed_kps = 0.343  # ~343 m/s
        for t in range(0, 91):
            shockwave_radius = sound_speed_kps * t  # km (raw, el front reescala al anillo exterior)
            crater_diameter = crater * 2 * (1 - np.exp(-t / 8.0))  # m
            time_series.append({
                "time_sec": t,
                "shockwave_radius_km": shockwave_radius,
                "crater_diameter_km": crater_diameter / 1000.0
            })

        return jsonify({
            "meta": {"units": "SI", "source": "team-computed", "name": meta_name},
            "kpis": {"energy_mt": round(E_Mt, 4), "crater_radius_m": crater},
            "rings_m": rings,
            "geojson": fc,
            "time_series": time_series
        })

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except requests.HTTPError as he:
        return jsonify({"error": f"NeoWs HTTP {he.response.status_code if he.response else '502'}"}), 502
    except Exception as e:
        return jsonify({"error": f"internal: {e}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
