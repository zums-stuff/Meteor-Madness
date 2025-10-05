import os
import math
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from geojson_builder import feature_collection_basic
from validators import validate_sim_payload

load_dotenv()

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv("NASA_API_KEY", "")
PORT = int(os.getenv("PORT", "8000"))
EPQS_URL = "https://epqs.nationalmap.gov/v1/json"


def us_elevation_m_or_none(lat: float, lon: float):
    try:
        params = {"x": lon, "y": lat, "units": "Meters", "wkid": 4326}
        r = requests.get(EPQS_URL, params=params, timeout=10)
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
    k = 120.0
    th = math.radians(angle_deg)
    return k * (E_Mt ** 0.25) * (math.sin(th) ** (1.0 / 3.0))


def blast_rings_m(E_Mt, angle_deg):
    th = math.radians(angle_deg)
    s = math.sin(th)
    base = E_Mt ** (1.0 / 3.0)
    coeff = {"10psi": 0.55 * 900, "5psi": 0.85 * 900, "3psi": 1.1 * 900, "1psi": 1.6 * 900}
    return {k: c * base * s for k, c in coeff.items()}


def fetch_neows(neo_id):
    if not API_KEY:
        raise RuntimeError("NASA_API_KEY no configurada")
    url = f"https://api.nasa.gov/neo/rest/v1/neo/{neo_id}?api_key={API_KEY}"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    return r.json()


def params_from_neows(data, density_kg_m3):
    dmin = float(data["estimated_diameter"]["meters"]["estimated_diameter_min"])
    dmax = float(data["estimated_diameter"]["meters"]["estimated_diameter_max"])
    diameter_m = (dmin + dmax) / 2.0
    ca = data.get("close_approach_data", [])
    if not ca:
        raise ValueError("NEO sin datos de acercamiento cercano")
    velocity_kms = float(ca[0]["relative_velocity"]["kilometers_per_second"])
    return diameter_m, density_kg_m3, velocity_kms


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
            return jsonify({"error": "Solo se permite EE. UU. continental (sin cobertura fuera de EE. UU.)."}), 400
        if elev_m <= 0:
            return jsonify({"error": "El punto seleccionado está sobre agua (elevación ≤ 0 m). Selecciona tierra firme en EE. UU."}), 400

        angle_deg = float(payload.get("angle_deg", 45.0))
        client_name = payload.get("name")

        if "neo_id" in payload:
            density_kg_m3 = float(payload["density_kg_m3"])
            neo_id = str(payload["neo_id"])
            data = fetch_neows(neo_id)
            diameter_m, density_kg_m3, velocity_kms = params_from_neows(data, density_kg_m3)
            meta_name = client_name or data.get("name")
        else:
            diameter_m = float(payload["diameter_m"])
            density_kg_m3 = float(payload["density_kg_m3"])
            velocity_kms = float(payload["velocity_kms"])
            meta_name = client_name

        v_ms = velocity_kms * 1000.0
        m_kg = mass_from_diameter(diameter_m, density_kg_m3)
        E_J = energy_joules(m_kg, v_ms)
        E_Mt = joules_to_megatons(E_J)
        crater = crater_radius_m(E_Mt, angle_deg)
        rings = blast_rings_m(E_Mt, angle_deg)
        fc = feature_collection_basic(lat, lon, crater, rings, steps=128)

        return jsonify({
            "meta": {"units": "SI", "source": "team-computed", "name": meta_name},
            "kpis": {"energy_mt": round(E_Mt, 4), "crater_radius_m": crater},
            "rings_m": rings,
            "geojson": fc
        })

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except requests.HTTPError as he:
        return jsonify({"error": f"NeoWs HTTP {he.response.status_code}"}), 502
    except Exception as e:
        return jsonify({"error": f"internal: {e}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
