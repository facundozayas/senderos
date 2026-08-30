/* Senderos — core geospatial/GPX logic, kept separate from app.js so it can be
   loaded both as a plain <script> in the browser and via require() in tests
   (see /tests). No dependencies, no build step. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SenderosCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- Distance / duration / pace ----------
  function haversine(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function totalDistance(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
    return d;
  }

  function formatKm(meters) {
    return (meters / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " km";
  }

  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function formatDurationShort(ms) {
    if (!ms) return "—";
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  }

  function formatPace(meters, ms) {
    if (meters < 20 || !ms) return "--:--";
    const minPerKm = ms / 60000 / (meters / 1000);
    if (!isFinite(minPerKm) || minPerKm <= 0) return "--:--";
    const min = Math.floor(minPerKm);
    const sec = Math.round((minPerKm - min) * 60);
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  // ---------- Elevation ----------
  function computeElevation(points) {
    // Coverage must be measured on the RAW readings, before forward-filling —
    // otherwise a single real altitude reading near the start makes every
    // filled-in point downstream count as "valid" and the 40% threshold
    // from gpx-tools.md never actually triggers.
    const rawValidCount = points.filter(
      (p) => p.alt !== null && p.alt !== undefined && isFinite(p.alt)
    ).length;
    if (rawValidCount < Math.max(2, points.length * 0.4)) return null;

    const raw = [];
    let lastAlt = null;
    points.forEach((p) => {
      let a = p.alt !== null && p.alt !== undefined && isFinite(p.alt) ? p.alt : lastAlt;
      if (a !== null) lastAlt = a;
      raw.push(a);
    });
    const firstValid = raw.find((a) => a !== null);
    const filled = raw.map((a) => (a === null ? firstValid : a));
    const win = 5;
    const smoothed = filled.map((_, i) => {
      const s = Math.max(0, i - Math.floor(win / 2));
      const e = Math.min(filled.length, i + Math.ceil(win / 2));
      const slice = filled.slice(s, e);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
    let gain = 0, loss = 0;
    for (let i = 1; i < smoothed.length; i++) {
      const d = smoothed[i] - smoothed[i - 1];
      if (d > 0.3) gain += d;
      else if (d < -0.3) loss += -d;
    }
    const N = Math.min(14, smoothed.length);
    const profile = [];
    for (let i = 0; i < N; i++) {
      const idx = Math.round((i * (smoothed.length - 1)) / (N - 1 || 1));
      profile.push(smoothed[idx]);
    }
    return { gain: Math.round(gain), loss: Math.round(loss), profile };
  }

  // ---------- Route cleanup / QA (see .claude/skills/route-qa.md) ----------
  function dedupeConsecutivePoints(points) {
    const out = [];
    for (const p of points) {
      const prev = out[out.length - 1];
      if (!prev || prev.lat !== p.lat || prev.lng !== p.lng) out.push(p);
    }
    return out;
  }

  function pointsValid(points) {
    return (
      Array.isArray(points) &&
      points.every(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          p.lat >= -90 &&
          p.lat <= 90 &&
          p.lng >= -180 &&
          p.lng <= 180
      )
    );
  }

  const MAX_SPEED_KMH = { trekking: 80, running: 80, bike: 120 };

  function findImpossibleJumps(points, maxKmh) {
    let jumps = 0;
    for (let i = 1; i < points.length; i++) {
      const d = haversine(points[i - 1], points[i]);
      const t0 = points[i - 1].t;
      const t1 = points[i].t;
      if (t0 !== null && t0 !== undefined && t1 !== null && t1 !== undefined) {
        const dtHours = (t1 - t0) / 3600000;
        if (dtHours > 0 && d / 1000 / dtHours > maxKmh) jumps++;
        else if (dtHours <= 0 && d > 500) jumps++;
      } else if (d > 500) {
        jumps++;
      }
    }
    return jumps;
  }

  // Checks the route-qa.md checklist. Only geometry that makes a route
  // unsalvageable (too few valid points, zero distance) blocks the save —
  // everything else (GPS jitter jumps, short duration, missing elevation)
  // is real-world-normal and only surfaces as a non-blocking warning.
  function validateRoute(route) {
    const errors = [];
    const warnings = [];
    const points = route.points || [];

    if (points.length < 2 || !pointsValid(points)) {
      errors.push("La ruta necesita al menos 2 puntos con coordenadas válidas.");
      return { ok: false, errors, warnings };
    }

    const distance = totalDistance(points);
    if (distance <= 0) {
      errors.push("La distancia total de la ruta es 0.");
      return { ok: false, errors, warnings };
    }

    const jumps = findImpossibleJumps(points, MAX_SPEED_KMH[route.activity] || 80);
    if (jumps > 0) {
      warnings.push(`${jumps} salto(s) de posición poco realista(s) detectado(s) (posible ruido de GPS).`);
    }
    if (route.source === "recorded" && !route.duration) {
      warnings.push("La duración registrada es 0.");
    }
    if (distance < 100) {
      warnings.push("La ruta mide menos de 100 m — podría ser un accidente.");
    }
    if (route.activity === "trekking" && (route.elevGain === null || route.elevGain === undefined)) {
      warnings.push("No hay datos de elevación para esta ruta de trekking.");
    }

    return { ok: true, errors, warnings };
  }

  // ---------- HTML escaping ----------
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------- GPX import/export (see .claude/skills/gpx-tools.md) ----------
  function parseGpx(text) {
    const dom = new DOMParser().parseFromString(text, "application/xml");
    if (dom.querySelector("parsererror")) return { points: [], name: null, timeOrderIssue: false };
    const trkpts = Array.from(dom.getElementsByTagName("trkpt"));
    const points = trkpts
      .map((pt) => {
        const lat = parseFloat(pt.getAttribute("lat"));
        const lng = parseFloat(pt.getAttribute("lon"));
        const eleEl = pt.getElementsByTagName("ele")[0];
        const timeEl = pt.getElementsByTagName("time")[0];
        const alt = eleEl ? parseFloat(eleEl.textContent) : null;
        const t = timeEl ? new Date(timeEl.textContent).getTime() : null;
        return { lat, lng, alt: isFinite(alt) ? alt : null, t: isFinite(t) ? t : null };
      })
      .filter(
        (p) =>
          isFinite(p.lat) &&
          isFinite(p.lng) &&
          p.lat >= -90 &&
          p.lat <= 90 &&
          p.lng >= -180 &&
          p.lng <= 180
      );

    let timeOrderIssue = false;
    for (let i = 1; i < points.length; i++) {
      if (points[i].t !== null && points[i - 1].t !== null && points[i].t < points[i - 1].t) {
        timeOrderIssue = true;
        break;
      }
    }

    const nameEl = dom.getElementsByTagName("name")[0];
    return { points, name: nameEl ? nameEl.textContent : null, timeOrderIssue };
  }

  function buildGpx(route) {
    const points = route.points
      .map((p) => {
        const time = p.t ? `<time>${new Date(p.t).toISOString()}</time>` : "";
        const ele = p.alt !== null && p.alt !== undefined ? `<ele>${p.alt.toFixed(1)}</ele>` : "";
        return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}${time}</trkpt>`;
      })
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Senderos" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeHtml(route.name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
  }

  return {
    haversine,
    totalDistance,
    formatKm,
    formatDuration,
    formatDurationShort,
    formatPace,
    computeElevation,
    dedupeConsecutivePoints,
    validateRoute,
    escapeHtml,
    parseGpx,
    buildGpx,
  };
});
