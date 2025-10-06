const mapEl = document.getElementById("map");
const latInput = document.getElementById("lat");
const lonInput = document.getElementById("lng");
const cityInput = document.getElementById("city");
const goBtn = document.getElementById("go");

const INITIAL = { lat: 38.9, lon: -98.35, zoom: 4 };

const map = L.map(mapEl, { zoomControl: true }).setView([INITIAL.lat, INITIAL.lon], INITIAL.zoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

let marker = null;
function setMarker(lat, lon, label = "") {
  if (marker) map.removeLayer(marker);
  const icon = L.divIcon({
    className: "red-pin",
    html: `<div style="
      width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.6)
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  marker = L.marker([lat, lon], { icon }).addTo(map);
  const text = label || `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
  marker.bindPopup(text, { autoClose: true }).openPopup();
}

function updateInputs(lat, lon) {
  latInput.value = Number(lat).toFixed(4);
  lonInput.value = Number(lon).toFixed(4);
}

async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`;
  const r = await fetch(url, { headers: { "Accept-Language": "es" } });
  if (!r.ok) throw new Error(`Geocoding HTTP ${r.status}`);
  const results = await r.json();
  if (!Array.isArray(results) || results.length === 0) throw new Error("No se encontró esa ubicación");
  const lat = parseFloat(results[0].lat);
  const lon = parseFloat(results[0].lon);
  const name = results[0].display_name || city;
  return { lat, lon, name };
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const r = await fetch(url, { headers: { "Accept-Language": "es" } });
    if (!r.ok) return "";
    const data = await r.json();
    return data.display_name || "";
  } catch {
    return "";
  }
}

map.on("click", async (e) => {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;
  const name = await reverseGeocode(lat, lon);
  setMarker(lat, lon, name);
  updateInputs(lat, lon);
});

goBtn?.addEventListener("click", async () => {
  const q = (cityInput?.value || "").trim();
  if (!q) return;
  try {
    const { lat, lon, name } = await geocodeCity(q);
    setMarker(lat, lon, name);
    updateInputs(lat, lon);
    map.flyTo([lat, lon], 8, { duration: 1.0 });
  } catch (e) {
    alert(e.message || e);
  }
});

cityInput?.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const q = (cityInput?.value || "").trim();
  if (!q) return;
  try {
    const { lat, lon, name } = await geocodeCity(q);
    setMarker(lat, lon, name);
    updateInputs(lat, lon);
    map.flyTo([lat, lon], 8, { duration: 1.0 });
  } catch (err) {
    alert(err.message || err);
  }
});

function centerFromInputs() {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  if (!isFinite(lat) || !isFinite(lon)) return;
  setMarker(lat, lon);
  map.flyTo([lat, lon], 8, { duration: 0.8 });
}
latInput?.addEventListener("change", centerFromInputs);
lonInput?.addEventListener("change", centerFromInputs);

window.MapCtx = {
  map,
  getLatLon: () => ({
    lat: parseFloat(latInput.value),
    lon: parseFloat(lonInput.value),
  }),
  setLatLon: (lat, lon) => { updateInputs(lat, lon); centerFromInputs(); }
};
