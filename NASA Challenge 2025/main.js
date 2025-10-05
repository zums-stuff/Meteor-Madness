const API_URL = "http://127.0.0.1:8000/simulate";

const $ = (s) => document.querySelector(s);

const state = { mode: "manual", map: null, marker: null, lastResult: null };

function setActiveTab(mode) {
  state.mode = mode;
  const btnManual = $("#btnManual");
  const btnId = $("#btnId");
  const panelManual = $("#panel-manual");
  const panelId = $("#panel-id");

  if (mode === "manual") {
    btnManual.classList.add("active"); btnManual.setAttribute("aria-selected", "true");
    btnId.classList.remove("active");  btnId.setAttribute("aria-selected", "false");
    panelManual.hidden = false; panelId.hidden = true;
  } else {
    btnId.classList.add("active");     btnId.setAttribute("aria-selected", "true");
    btnManual.classList.remove("active"); btnManual.setAttribute("aria-selected", "false");
    panelId.hidden = false; panelManual.hidden = true;
  }
}

let resultLayer = null;

function initMap() {
  const mapEl = document.getElementById("map");
  state.map = L.map(mapEl, { zoomControl: true }).setView([38.9, -98.35], 4);

  const US_BOUNDS = L.latLngBounds([24.396308, -124.848974], [49.384358, -66.885444]);
  state.map.setMaxBounds(US_BOUNDS);
  state.map.setMinZoom(3);
  state.map.on("drag", () => { state.map.panInsideBounds(US_BOUNDS, { animate: true }); });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(state.map);

  state.map.on("click", async (e) => {
    if (!US_BOUNDS.contains(e.latlng)) {
      alert("Select a point within the continental U.S.");
      return;
    }
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    setLatLon(lat, lon);
    const name = await reverseGeocode(lat, lon);
    setMarker(lat, lon, name);
  });
}

function setMarker(lat, lon, label = "") {
  if (state.marker) state.map.removeLayer(state.marker);
  const icon = L.divIcon({
    className: "red-pin",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.6)"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
  state.marker = L.marker([lat, lon], { icon }).addTo(state.map);
  const text = label || `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
  state.marker.bindPopup(text, { autoClose: true }).openPopup();
}

function setLatLon(lat, lon) {
  $("#lat").value = Number(lat).toFixed(4);
  $("#lng").value = Number(lon).toFixed(4);
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const r = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!r.ok) return "";
    const data = await r.json();
    return data.display_name || "";
  } catch { return ""; }
}

async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`;
  const r = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!r.ok) throw new Error(`Geocoding HTTP ${r.status}`);
  const results = await r.json();
  if (!Array.isArray(results) || results.length === 0) throw new Error("Location not found");
  const lat = parseFloat(results[0].lat);
  const lon = parseFloat(results[0].lon);
  const name = results[0].display_name || city;
  return { lat, lon, name };
}

function requireNumber(value, name) {
  if (value === "" || value === null || value === undefined) throw new Error(`Required: ${name}`);
  const v = Number(value);
  if (!isFinite(v)) throw new Error(`Invalid: ${name}`);
  return v;
}

function readLatLon() {
  const lat = requireNumber($("#lat").value, "Latitude");
  const lon = requireNumber($("#lng").value, "Longitude");
  return { lat, lon };
}

function buildPayload() {
  const { lat, lon } = readLatLon();

  if (state.mode === "manual") {
    const diameter_m = requireNumber($("#diam").value, "Diameter (m)");
    const velocity_kms = requireNumber($("#vel").value, "Speed (km/s)");
    const density_kg_m3 = requireNumber($("#dens").value || "3000", "Density (kg/m³)");

    const angle_raw = $("#ang").value; 
    const payload = { lat, lon, diameter_m, velocity_kms, density_kg_m3 };
    if (angle_raw !== "" && angle_raw !== null && angle_raw !== undefined) {
      const angle_deg = requireNumber(angle_raw, "Angle (°)");
      payload.angle_deg = angle_deg;
    }

    const name_manual = ($("#name_manual")?.value || "").trim();
    if (name_manual) payload.name = name_manual;

    return payload;

  } else {
    const neo_id = ($("#asteroid_id").value || "").trim();
    if (!neo_id) throw new Error("Enter an asteroid ID");
    const density_kg_m3 = requireNumber($("#dens_id").value || "3000", "Density (kg/m³)");

    const angle_raw = $("#ang_id").value;
    const payload = { lat, lon, neo_id, density_kg_m3 };
    if (angle_raw !== "" && angle_raw !== null && angle_raw !== undefined) {
      const angle_deg = requireNumber(angle_raw, "Angle (°)");
      payload.angle_deg = angle_deg;
    }
    return payload;
  }
}

async function simulate() {
  try {
    const payload = buildPayload();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg += `: ${j.error}`; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    state.lastResult = data;

    updateKPIs(data);
    updateDetails(data, payload);
    drawResultCanvas(data);
    enableGeoDownload(data);

    drawGeoOnMap(data.geojson);

    if (Array.isArray(data.time_series) && data.time_series.length > 0) {
      const lat = Number($("#lat").value);
      const lon = Number($("#lng").value);
      playTimeSeries(data.time_series, lat, lon, data.rings_m); 
    }

    $("#summaryHint").textContent = "Simulation complete. Adjust parameters and run again if needed.";
  } catch (e) {
    alert(e.message || e);
  }
}

function updateKPIs(data) {
  const E = data?.kpis?.energy_mt;
  const crater = data?.kpis?.crater_radius_m;
  $("#kpiEnergy").textContent = isFinite(E) ? Number(E).toFixed(2) : "—";
  $("#kpiCrater").textContent = isFinite(crater) ? Math.round(crater) : "—";
}

function updateDetails(data, payload) {
  const modeText = state.mode === "manual" ? "Manual" : "Asteroid ID";
  const metaName = data?.meta?.name;
  const fallbackName = state.mode === "manual" ? (payload.name || "—") : (payload.neo_id || "—");
  const shownName = metaName || fallbackName;

  const d = payload.diameter_m ?? "—";
  const v = payload.velocity_kms ?? "—";
  const rho = payload.density_kg_m3 ?? "—";
  const loc = `${payload.lat?.toFixed ? payload.lat.toFixed(4) : payload.lat}, ${payload.lon?.toFixed ? payload.lon.toFixed(4) : payload.lon}`;
  const E = data?.kpis?.energy_mt ?? "—";
  const crater = data?.kpis?.crater_radius_m ?? "—";

  $("#detailsList").innerHTML = `
    <li><strong>Mode:</strong> ${modeText}</li>
    <li><strong>Name:</strong> ${shownName}</li>
    <li><strong>Diameter (m):</strong> ${d}</li>
    <li><strong>Speed (km/s):</strong> ${v}</li>
    <li><strong>Density (kg/m³):</strong> ${rho}</li>
    <li><strong>Location:</strong> ${loc}</li>
    <li><strong>Energy (Mt TNT):</strong> ${isFinite(E)?Number(E).toFixed(2):"—"}</li>
    <li><strong>Crater (m):</strong> ${isFinite(crater)?Math.round(crater):"—"}</li>
  `;
}

function getResultCanvas() {
  const canvas = $("#resultCanvas");
  const box = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.round(box.width * dpr));
  canvas.height = Math.max(220, Math.round(box.height * dpr));
  return canvas;
}

function drawResultCanvas(result) {
  const canvas = getResultCanvas();
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const crater_m = result?.kpis?.crater_radius_m || 0;
  const rings = result?.rings_m || {};
  const r10 = rings["10psi"] || 0;
  const r5  = rings["5psi"]  || 0;
  const r3  = rings["3psi"]  || 0;
  const r1  = rings["1psi"]  || 0;

  const maxR = Math.max(crater_m, r1, r3, r5, r10);
  const pad = 36 * (window.devicePixelRatio || 1);
  const usable = Math.min(canvas.width, canvas.height) - pad * 2;
  const scale = (usable > 0 && maxR > 0) ? usable / (2 * maxR) : 1;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  circle(ctx, cx, cy, r10*scale, 3, "#f0ad4e");
  circle(ctx, cx, cy, r5 *scale, 2, "#f7e463");
  circle(ctx, cx, cy, r3 *scale, 2, "#5bc0de");
  circle(ctx, cx, cy, r1 *scale, 2, "#5cb85c");
  circle(ctx, cx, cy, crater_m*scale, 3, "#d9534f");

  legend(ctx, pad, pad);
  footer(ctx, crater_m, result?.kpis?.energy_mt);
}

function circle(ctx, cx, cy, r, lineWidth, color) {
  if (!isFinite(r) || r <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function legend(ctx, x, y) {
  const s = (window.devicePixelRatio || 1);
  ctx.save();
  ctx.font = `${12*s}px system-ui, Arial`;
  let yy = y + 4*s;
  [["Crater","#d9534f"],["10 psi","#f0ad4e"],["5 psi","#f7e463"],["3 psi","#5bc0de"],["1 psi","#5cb85c"]]
    .forEach(([label,color])=>{
      ctx.fillStyle=color; ctx.fillRect(x, yy-10*s, 12*s, 12*s);
      ctx.fillStyle="#e5e7eb"; ctx.fillText(label, x+18*s, yy);
      yy += 18*s;
    });
  ctx.restore();
}

function footer(ctx, crater_m, E_mt) {
  const s = (window.devicePixelRatio || 1);
  ctx.save();
  ctx.font = `${12*s}px system-ui, Arial`;
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(`Energy: ${isFinite(E_mt)?Number(E_mt).toFixed(2):"—"} Mt TNT`, 12*s, ctx.canvas.height - 28*s);
  ctx.fillText(`Crater radius: ${isFinite(crater_m)?(crater_m/1000).toFixed(2):"—"} km`, 12*s, ctx.canvas.height - 12*s);
  ctx.restore();
}

function enableGeoDownload(data) {
  const btn = $("#btnDownloadGeo");
  if (!btn) return;
  btn.disabled = false;
  btn.onclick = () => {
    const blob = new Blob([JSON.stringify(data.geojson || {}, null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "impact_result.geojson";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

function colorFor(feature) {
  const t = feature?.properties?.type || "";
  const psi = feature?.properties?.psi || "";
  if (t === "crater") return "#d9534f";
  if (t === "ring") {
    if (psi === "10psi") return "#f0ad4e";
    if (psi === "5psi")  return "#f7e463";
    if (psi === "3psi")  return "#5bc0de";
    if (psi === "1psi")  return "#5cb85c";
  }
  return "#888";
}

function styleFeature(feature) {
  return {
    color: colorFor(feature),
    weight: feature?.properties?.type === "crater" ? 3 : 2,
    opacity: 1,
    fillOpacity: feature?.properties?.type === "crater" ? 0.08 : 0.05
  };
}

function drawGeoOnMap(fc) {
  if (!state.map) return;
  if (resultLayer) {
    state.map.removeLayer(resultLayer);
    resultLayer = null;
  }
  if (!fc) return;

  resultLayer = L.geoJSON(fc, {
    style: styleFeature,
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const txt = [
        p.type ? `Type: ${p.type}` : "",
        p.psi ? `Ring: ${p.psi}` : "",
        p.radius_m ? `Radius (m): ${Math.round(p.radius_m)}` : ""
      ].filter(Boolean).join("<br>");
      if (txt) layer.bindPopup(txt);
    }
  }).addTo(state.map);

  try {
    const b = resultLayer.getBounds();
    if (b.isValid()) state.map.fitBounds(b, { padding: [30, 30] });
  } catch (_) {}
}

let anim = { timer: null, layer: null, circleShock: null, circleCrater: null, i: 0 };

function stopTimeSeries() {
  if (anim.timer) { clearInterval(anim.timer); anim.timer = null; }
  if (anim.layer && state.map) { state.map.removeLayer(anim.layer); }
  anim = { timer: null, layer: null, circleShock: null, circleCrater: null, i: 0 };
}

function getOuterRingMeters(rings) {
  if (!rings) return 0;
  const vals = [
    rings["1psi"] || 0,
    rings["3psi"] || 0,
    rings["5psi"] || 0,
    rings["10psi"] || 0,
  ];
  return Math.max(...vals);
}

function playTimeSeries(ts, centerLat, centerLon, rings) {
  stopTimeSeries();
  if (!Array.isArray(ts) || ts.length === 0 || !state.map) return;

  const outer_m = getOuterRingMeters(rings);
  if (!(outer_m > 0)) return;

  const last = ts[ts.length - 1];
  const lastShock_m_raw = (Number(last?.shockwave_radius_km) || 0) * 1000.0;
  const scale = lastShock_m_raw > 0 ? (outer_m / lastShock_m_raw) : 1.0;

  anim.layer = L.layerGroup().addTo(state.map);
  const center = L.latLng(centerLat, centerLon);

  anim.circleShock = L.circle(center, {
    radius: 1,
    color: "#5bc0de",
    weight: 2,
    fillOpacity: 0.05
  }).addTo(anim.layer);

  anim.circleCrater = L.circle(center, {
    radius: 1,
    color: "#d9534f",
    weight: 3,
    fillOpacity: 0.08
  }).addTo(anim.layer);

  try {
    const finalBounds = L.circle(center, { radius: outer_m }).getBounds();
    state.map.fitBounds(finalBounds, { padding: [30, 30] });
  } catch (_) {}

  const TOTAL_MS = 8000; 
  const stepMs = Math.max(16, Math.round(TOTAL_MS / ts.length));

  let i = 0;
  anim.timer = setInterval(() => {
    if (i >= ts.length) { stopTimeSeries(); return; }

    const frame = ts[i];
    const shock_m_raw  = (Number(frame.shockwave_radius_km) || 0) * 1000.0;
    const crater_m_raw = ((Number(frame.crater_diameter_km) || 0) * 1000.0) / 2.0;

    const shock_m  = Math.min(shock_m_raw * scale, outer_m);
    const crater_m = Math.min(crater_m_raw, outer_m);

    if (shock_m > 0) anim.circleShock.setRadius(shock_m);
    if (crater_m > 0) anim.circleCrater.setRadius(crater_m);

    const hint = `t=${frame.time_sec}s • shock=${(shock_m/1000).toFixed(1)} km • crater=${(crater_m/1000).toFixed(2)} km`;
    const el = document.getElementById("summaryHint");
    if (el) el.textContent = hint;

    i += 1;
  }, stepMs);
}

function bindUI() {
  $("#btnManual")?.addEventListener("click", () => setActiveTab("manual"));
  $("#btnId")?.addEventListener("click", () => setActiveTab("id"));
  $("#toMap")?.addEventListener("click", (e) => { e.preventDefault(); location.hash = "#paso-mapa"; });
  $("#toSim")?.addEventListener("click", (e) => {
    e.preventDefault();
    simulate();
  });

  $("#go")?.addEventListener("click", async () => {
    const q = ($("#city")?.value || "").trim();
    if (!q) return;
    try {
      const { lat, lon, name } = await geocodeCity(q);
      setLatLon(lat, lon);
      setMarker(lat, lon, name);
      state.map.flyTo([lat, lon], 8, { duration: 1 });
    } catch (err) { alert(err.message || err); }
  });
  $("#city")?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const q = ($("#city")?.value || "").trim();
    if (!q) return;
    try {
      const { lat, lon, name } = await geocodeCity(q);
      setLatLon(lat, lon);
      setMarker(lat, lon, name);
      state.map.flyTo([lat, lon], 8, { duration: 1 });
    } catch (err) { alert(err.message || err); }
  });

  $("#lat")?.addEventListener("change", () => {
    const lat = parseFloat($("#lat").value);
    const lon = parseFloat($("#lng").value);
    if (isFinite(lat) && isFinite(lon)) { setMarker(lat, lon); state.map.flyTo([lat, lon], 8, { duration: .8 }); }
  });
  $("#lng")?.addEventListener("change", () => {
    const lat = parseFloat($("#lat").value);
    const lon = parseFloat($("#lng").value);
    if (isFinite(lat) && isFinite(lon)) { setMarker(lat, lon); state.map.flyTo([lat, lon], 8, { duration: .8 }); }
  });

  setActiveTab("manual");
  initMap();
}

window.addEventListener("DOMContentLoaded", bindUI);
