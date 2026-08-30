/* Senderos — a personal trekking/bike/running app
   Map: OpenStreetMap (via Leaflet, vendored locally). No API key, no cost.
   Storage: browser localStorage (stays on this device/browser). */

(function () {
  "use strict";

  const STORAGE_KEY = "senderos_routes_v3";
  const THEME_KEY = "senderos_theme";
  const OFFLINE_AREAS_KEY = "senderos_offline_areas";
  const OFFLINE_CACHE = "senderos-offline-tiles";
  const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const MAX_OFFLINE_TILES = 220;
  const ACTIVE_RECORDING_KEY = "senderos_active_recording";
  const FIRST_FIX_GRACE_MS = 12000;

  const {
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
  } = window.SenderosCore;

  // ---------- Activities ----------
  const ACTIVITIES = [
    { id: "trekking", label: "Trekking", icon: '<path d="M3 20 L9.5 7 L13 13.5 L15.3 10 L21 20 Z"/>' },
    { id: "bike", label: "Bike", icon: '<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17 L10 9 H14 M10 9 L13 17 M13 17 L18 17 L15 11 H9"/>' },
    { id: "running", label: "Running", icon: '<circle cx="14.5" cy="5" r="1.8"/><path d="M8 21 L11 15 L9 12 L12 8 L15 11 L14 15 L18 17 M11 15 L15.5 14"/>' },
  ];

  const THEMES = [
    { id: "green", name: "Outdoor green", desc: "Warm, Komoot-style", swatch: ["#2f6b4f", "#f6f4ef", "#b3432c"] },
    { id: "light", name: "Light minimal", desc: "White, map-focused", swatch: ["#ffffff", "#16181a", "#2f6460"] },
    { id: "dark", name: "Dark", desc: "Night mode, amber accent", swatch: ["#121316", "#f4b942", "#191b1f"] },
  ];

  // ---------- State ----------
  let map, liveMarker, liveAccuracyCircle, livePolyline, trailsLayer;
  let watchId = null;
  let recording = false;
  let paused = false;
  let trackPoints = [];
  let startTime = null;
  let elapsedBeforePause = 0;
  let timerInterval = null;
  let pendingSaveDistance = 0;
  let pendingElev = null;
  let viewingRouteId = null;
  let selectedActivity = "trekking";
  let currentMode = "record"; // 'record' | 'plan'
  let planPoints = [];
  let planPolyline = null;
  let planMarkers = [];
  let historyFilter = "all";
  let trailsVisible = false;
  let lastSearchAt = 0;
  let pendingImport = null;
  let pendingOfflineTiles = [];
  let localMapLayer = null;
  let localMapVisible = false;
  const LOCAL_MAP_META_KEY = "senderos_local_map_meta";

  // ---------- Utilities ----------
  // haversine / totalDistance / formatKm / formatDuration / formatDurationShort /
  // formatPace live in geo.js (window.SenderosCore) now, so they're testable from Node.

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function activityMeta(id) {
    return ACTIVITIES.find((a) => a.id === id) || ACTIVITIES[0];
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- Keyboard accessibility for div-based controls ----------
  function enableKeyboardActivation(el) {
    if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
    if (!el.hasAttribute("role")) el.setAttribute("role", "button");
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        el.click();
      }
    });
  }

  // ---------- Save a route through the route-qa checklist ----------
  function trySaveRoute(route, successMessage) {
    const cleanPoints = dedupeConsecutivePoints(route.points);
    const candidate = { ...route, points: cleanPoints, distance: totalDistance(cleanPoints) };
    const result = validateRoute(candidate);
    if (!result.ok) {
      toast(result.errors[0]);
      return false;
    }
    addRoute(candidate);
    toast(result.warnings.length > 0 ? `${successMessage} (${result.warnings[0]})` : successMessage);
    return true;
  }

  // ---------- Theme ----------
  function applyTheme(id) {
    document.body.className = "theme-" + id;
    localStorage.setItem(THEME_KEY, id);
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
    const metaTheme = document.getElementById("meta-theme-color");
    if (metaTheme && bg) metaTheme.setAttribute("content", bg);
    renderThemeOptions();
  }

  function renderThemeOptions() {
    const el = document.getElementById("theme-options");
    if (!el) return;
    const current = localStorage.getItem(THEME_KEY) || "green";
    el.innerHTML = "";
    THEMES.forEach((t) => {
      const div = document.createElement("div");
      div.className = "theme-option" + (t.id === current ? " selected" : "");
      div.innerHTML = `
        <div class="theme-swatch" style="background:linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%, ${t.swatch[1]} 100%); box-shadow: inset 0 0 0 12px ${t.swatch[2]}22;"></div>
        <div>
          <div class="name">${t.name}</div>
          <div class="desc">${t.desc}</div>
        </div>
        <div class="check"></div>`;
      div.addEventListener("click", () => applyTheme(t.id));
      el.appendChild(div);
    });
  }

  // ---------- Storage: routes ----------
  function loadRoutes() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveRoutes(routes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  }
  function addRoute(route) {
    const routes = loadRoutes();
    routes.unshift(route);
    saveRoutes(routes);
  }
  function deleteRoute(id) {
    saveRoutes(loadRoutes().filter((r) => r.id !== id));
  }

  // ---------- Elevation ----------
  // computeElevation lives in geo.js now.

  function renderElevSvg(profile) {
    const svg = document.getElementById("elev-svg");
    if (!profile || profile.length < 2) {
      svg.innerHTML = "";
      return;
    }
    const min = Math.min(...profile), max = Math.max(...profile);
    const range = max - min || 1;
    const w = 320, h = 40, pad = 3;
    const pts = profile
      .map((v, i) => {
        const x = (i * w) / (profile.length - 1);
        const y = pad + (h - 2 * pad) * (1 - (v - min) / range);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    svg.innerHTML = `<polyline points="${pts}" style="fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;"/>`;
  }

  // ---------- Map ----------
  function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: true }).setView([-34.6, -58.4], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    trailsLayer = L.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.85,
      attribution: 'Trails &copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>',
    });

    livePolyline = L.polyline([], { color: "#b3432c", weight: 5, opacity: 0.9 }).addTo(map);
    planPolyline = L.polyline([], { color: "#2f6b4f", weight: 4, opacity: 0.85, dashArray: "1 8" }).addTo(map);

    map.on("click", (e) => {
      if (currentMode === "plan" && !recording) addPlanPoint(e.latlng);
    });

    if (localStorage.getItem("senderos_trails_visible") === "1") {
      trailsVisible = true;
      trailsLayer.addTo(map);
      document.getElementById("btn-trails-toggle").classList.add("active");
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 15);
          updateLiveMarker(pos);
        },
        () => toast("Couldn't access your location. Check your permissions."),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }

  function updateLiveMarker(pos) {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    if (!liveMarker) {
      liveMarker = L.circleMarker(latlng, { radius: 8, color: "#fff", weight: 3, fillColor: "#2f6b4f", fillOpacity: 1 }).addTo(map);
    } else {
      liveMarker.setLatLng(latlng);
    }
    if (pos.coords.accuracy) {
      if (!liveAccuracyCircle) {
        liveAccuracyCircle = L.circle(latlng, { radius: pos.coords.accuracy, color: "#2f6b4f", weight: 1, opacity: 0.3, fillOpacity: 0.08 }).addTo(map);
      } else {
        liveAccuracyCircle.setLatLng(latlng);
        liveAccuracyCircle.setRadius(pos.coords.accuracy);
      }
    }
  }

  document.getElementById("btn-locate").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 16);
        updateLiveMarker(pos);
      },
      () => toast("Couldn't access your location."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // ---------- Trails overlay (Waymarked Trails) ----------
  document.getElementById("btn-trails-toggle").addEventListener("click", () => {
    trailsVisible = !trailsVisible;
    if (trailsVisible) {
      trailsLayer.addTo(map);
      toast("Showing mapped trails (OpenStreetMap)");
    } else {
      map.removeLayer(trailsLayer);
    }
    localStorage.setItem("senderos_trails_visible", trailsVisible ? "1" : "0");
    document.getElementById("btn-trails-toggle").classList.toggle("active", trailsVisible);
  });

  // ---------- Search (Nominatim) ----------
  const searchInput = document.getElementById("search-input");
  const searchResultsEl = document.getElementById("search-results");

  async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    const now = Date.now();
    if (now - lastSearchAt < 1100) {
      toast("Wait a second before searching again.");
      return;
    }
    lastSearchAt = now;
    searchResultsEl.innerHTML = '<div class="search-result-item">Searching…</div>';
    searchResultsEl.classList.add("active");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        searchResultsEl.innerHTML = '<div class="search-result-item">No results found</div>';
        return;
      }
      searchResultsEl.innerHTML = "";
      data.forEach((place) => {
        const item = document.createElement("div");
        item.className = "search-result-item";
        const main = place.display_name.split(",")[0];
        item.innerHTML = `<div class="name">${escapeHtml(main)}</div><div class="sub">${escapeHtml(place.display_name)}</div>`;
        item.addEventListener("click", () => {
          map.setView([parseFloat(place.lat), parseFloat(place.lon)], 15);
          searchResultsEl.classList.remove("active");
          searchInput.value = main;
        });
        searchResultsEl.appendChild(item);
      });
    } catch (e) {
      searchResultsEl.innerHTML = '<div class="search-result-item">Search failed. Check your connection.</div>';
    }
  }

  document.getElementById("btn-search").addEventListener("click", runSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });
  searchInput.addEventListener("focus", () => {
    if (searchResultsEl.children.length > 0) searchResultsEl.classList.add("active");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) searchResultsEl.classList.remove("active");
  });

  // ---------- Activity selector ----------
  function renderActivityRow() {
    const row = document.getElementById("activity-row");
    row.innerHTML = "";
    ACTIVITIES.forEach((a) => {
      const pill = document.createElement("div");
      pill.className = "activity-pill" + (a.id === selectedActivity ? " active" : "");
      pill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg>${a.label}`;
      pill.addEventListener("click", () => {
        selectedActivity = a.id;
        renderActivityRow();
      });
      enableKeyboardActivation(pill);
      row.appendChild(pill);
    });
  }

  // ---------- Record / Plan mode ----------
  function setMode(mode) {
    if (recording) {
      toast("Finish recording before switching modes.");
      return;
    }
    if (mode === "record" && planPoints.length > 0) {
      if (!confirm("You'll lose the route you were planning. Continue?")) return;
      clearPlan();
    }
    currentMode = mode;
    document.querySelectorAll(".mode-tab").forEach((el) => el.classList.toggle("active", el.dataset.mode === mode));

    const isPlan = mode === "plan";
    document.getElementById("plan-banner").style.display = isPlan ? "block" : "none";
    document.getElementById("plan-stat-bar").style.display = isPlan ? "flex" : "none";
    document.getElementById("controls-plan").style.display = isPlan ? "flex" : "none";
    document.getElementById("controls-idle").style.display = isPlan ? "none" : "flex";
    document.getElementById("stat-bar").style.display = "none";
    document.getElementById("elev-box").style.display = "none";
  }

  document.querySelectorAll(".mode-tab").forEach((el) => {
    el.addEventListener("click", () => setMode(el.dataset.mode));
    enableKeyboardActivation(el);
  });

  function addPlanPoint(latlng) {
    planPoints.push({ lat: latlng.lat, lng: latlng.lng });
    redrawPlan();
  }

  function redrawPlan() {
    const latlngs = planPoints.map((p) => [p.lat, p.lng]);
    planPolyline.setLatLngs(latlngs);
    planMarkers.forEach((m) => map.removeLayer(m));
    planMarkers = planPoints.map((p) =>
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 2, fillColor: "#2f6b4f", fillOpacity: 1 }).addTo(map)
    );
    const dist = totalDistance(planPoints);
    document.getElementById("plan-dist").textContent = formatKm(dist);
    document.getElementById("plan-points").textContent = String(planPoints.length);
    document.getElementById("btn-plan-save").disabled = planPoints.length < 2;
  }

  function clearPlan() {
    planPoints = [];
    redrawPlan();
  }

  document.getElementById("btn-plan-undo").addEventListener("click", () => {
    planPoints.pop();
    redrawPlan();
  });

  document.getElementById("btn-plan-save").addEventListener("click", () => {
    if (planPoints.length < 2) return;
    document.getElementById("plan-name-input").value = "Planned route " + new Date().toLocaleDateString("en-US");
    document.getElementById("plan-save-modal").classList.add("active");
  });

  document.getElementById("btn-plan-discard").addEventListener("click", () => {
    document.getElementById("plan-save-modal").classList.remove("active");
  });

  document.getElementById("btn-plan-confirm").addEventListener("click", () => {
    const name = document.getElementById("plan-name-input").value.trim() || "Untitled route";
    const route = {
      id: "r_" + Date.now(),
      name,
      date: new Date().toISOString(),
      activity: selectedActivity,
      source: "planned",
      points: planPoints,
      distance: totalDistance(planPoints),
      duration: 0,
      elevGain: null,
      elevLoss: null,
    };
    const saved = trySaveRoute(route, "Planned route saved!");
    document.getElementById("plan-save-modal").classList.remove("active");
    if (saved) {
      clearPlan();
      renderHistory();
    }
  });

  // ---------- Autosave / crash recovery for an in-progress recording ----------
  function saveActiveRecording() {
    try {
      localStorage.setItem(
        ACTIVE_RECORDING_KEY,
        JSON.stringify({
          activity: selectedActivity,
          startTime,
          elapsedBeforePause,
          points: trackPoints,
          savedAt: Date.now(),
        })
      );
    } catch (e) {
      /* storage full/unavailable — recording continues in memory only */
    }
  }

  function clearActiveRecording() {
    localStorage.removeItem(ACTIVE_RECORDING_KEY);
  }

  function loadActiveRecording() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_RECORDING_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function tryRecoverActiveRecording() {
    const data = loadActiveRecording();
    if (!data || !Array.isArray(data.points) || data.points.length < 2) {
      if (data) clearActiveRecording();
      return;
    }
    if (!navigator.geolocation) {
      clearActiveRecording();
      return;
    }
    const ageMin = Math.max(0, Math.round((Date.now() - (data.savedAt || 0)) / 60000));
    const wantsRecover = confirm(
      `Encontramos una grabación de ${activityMeta(data.activity).label.toLowerCase()} sin guardar (hace ${ageMin} min). ` +
        `¿Querés recuperarla? Vas a quedar en pausa para revisarla antes de seguir o guardarla.`
    );
    if (!wantsRecover) {
      clearActiveRecording();
      return;
    }

    selectedActivity = data.activity || "trekking";
    trackPoints = data.points;
    elapsedBeforePause = data.elapsedBeforePause || 0;
    startTime = Date.now();
    recording = true;
    paused = true;

    renderActivityRow();
    if (currentMode === "plan") setMode("record");
    switchView("map");
    document.getElementById("controls-idle").style.display = "none";
    document.getElementById("controls-recording").style.display = "flex";
    document.getElementById("btn-pause").textContent = "▶ Resume";
    document.getElementById("stat-bar").style.display = "flex";

    if (livePolyline) {
      livePolyline.setLatLngs(trackPoints.map((pt) => [pt.lat, pt.lng]));
      map.fitBounds(livePolyline.getBounds(), { padding: [30, 30] });
    }
    updateStats();
    timerInterval = setInterval(updateStats, 1000);

    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    });

    toast("Grabación recuperada — está en pausa, tocá Resume para seguir.");
    saveActiveRecording();
  }

  // ---------- Recording ----------
  function startRecording() {
    if (!navigator.geolocation) {
      toast("Your browser doesn't support geolocation.");
      return;
    }
    recording = true;
    paused = false;
    trackPoints = [];
    elapsedBeforePause = 0;
    startTime = Date.now();

    document.getElementById("controls-idle").style.display = "none";
    document.getElementById("controls-recording").style.display = "flex";
    document.getElementById("btn-pause").textContent = "⏸ Pause";
    document.getElementById("stat-bar").style.display = "flex";
    document.getElementById("elev-box").style.display = "none";

    if (livePolyline) livePolyline.setLatLngs([]);

    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    });

    timerInterval = setInterval(updateStats, 1000);
    updateStats();
    saveActiveRecording();
  }

  function onPosition(pos) {
    updateLiveMarker(pos);
    if (!recording || paused) return;
    const p = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      t: Date.now(),
      alt: pos.coords.altitude !== null && pos.coords.altitude !== undefined ? pos.coords.altitude : null,
    };
    if (pos.coords.accuracy && pos.coords.accuracy > 50) {
      // Reject inaccurate fixes — but if we still have zero points after a
      // while, GPS may just be consistently noisy here (tree cover, canyon):
      // accept one anyway so the recording isn't stuck empty forever.
      const stillWaitingForFirstFix = trackPoints.length === 0 && Date.now() - startTime < FIRST_FIX_GRACE_MS;
      if (stillWaitingForFirstFix) return;
    }
    trackPoints.push(p);
    livePolyline.addLatLng([p.lat, p.lng]);
    map.panTo([p.lat, p.lng], { animate: true });
    if (trackPoints.length % 5 === 0) saveActiveRecording();
  }

  function onPositionError() {
    toast("Weak GPS signal. Keep moving, it will retry automatically.");
  }

  function updateStats() {
    const dist = totalDistance(trackPoints);
    let elapsed = elapsedBeforePause;
    if (!paused && startTime) elapsed += Date.now() - startTime;
    document.getElementById("stat-dist").textContent = formatKm(dist);
    document.getElementById("stat-time").textContent = formatDuration(elapsed);
    document.getElementById("stat-pace").textContent = formatPace(dist, elapsed);
    pendingSaveDistance = dist;

    if (trackPoints.length >= 4) {
      pendingElev = computeElevation(trackPoints);
      const box = document.getElementById("elev-box");
      if (pendingElev) {
        box.style.display = "block";
        document.getElementById("elev-figures").textContent = `+${pendingElev.gain} m / -${pendingElev.loss} m`;
        renderElevSvg(pendingElev.profile);
      } else {
        box.style.display = "none";
      }
    }
  }

  function togglePause() {
    if (!recording) return;
    if (!paused) {
      paused = true;
      elapsedBeforePause += Date.now() - startTime;
      document.getElementById("btn-pause").textContent = "▶ Resume";
    } else {
      paused = false;
      startTime = Date.now();
      document.getElementById("btn-pause").textContent = "⏸ Pause";
    }
    saveActiveRecording();
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    if (!paused && startTime) elapsedBeforePause += Date.now() - startTime;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(timerInterval);

    document.getElementById("controls-recording").style.display = "none";

    if (trackPoints.length < 2) {
      toast("Trail too short, not saved.");
      document.getElementById("controls-idle").style.display = "flex";
      document.getElementById("stat-bar").style.display = "none";
      document.getElementById("elev-box").style.display = "none";
      return;
    }

    pendingElev = computeElevation(trackPoints);
    document.getElementById("route-name-input").value = "Trail " + new Date().toLocaleDateString("en-US");
    document.getElementById("save-modal").classList.add("active");
  }

  function finishSave(save) {
    document.getElementById("save-modal").classList.remove("active");
    document.getElementById("controls-idle").style.display = "flex";
    document.getElementById("stat-bar").style.display = "none";
    document.getElementById("elev-box").style.display = "none";

    if (save) {
      const name = document.getElementById("route-name-input").value.trim() || "Untitled trail";
      const route = {
        id: "r_" + Date.now(),
        name,
        date: new Date().toISOString(),
        activity: selectedActivity,
        source: "recorded",
        points: trackPoints,
        distance: pendingSaveDistance,
        duration: elapsedBeforePause,
        elevGain: pendingElev ? pendingElev.gain : null,
        elevLoss: pendingElev ? pendingElev.loss : null,
      };
      if (trySaveRoute(route, "Trail saved!")) renderHistory();
    } else {
      toast("Trail discarded.");
    }
    clearActiveRecording();
    trackPoints = [];
    pendingElev = null;
    if (livePolyline) livePolyline.setLatLngs([]);
    document.getElementById("stat-dist").textContent = "0.00 km";
    document.getElementById("stat-time").textContent = "00:00:00";
    document.getElementById("stat-pace").textContent = "--:--";
  }

  document.getElementById("btn-start").addEventListener("click", startRecording);
  document.getElementById("btn-pause").addEventListener("click", togglePause);
  document.getElementById("btn-stop").addEventListener("click", stopRecording);
  document.getElementById("btn-save").addEventListener("click", () => finishSave(true));
  document.getElementById("btn-discard").addEventListener("click", () => finishSave(false));

  // ---------- History ----------
  function renderFilters() {
    const row = document.getElementById("filter-row");
    row.innerHTML = "";
    const opts = [{ id: "all", label: "All" }, ...ACTIVITIES];
    opts.forEach((o) => {
      const chip = document.createElement("div");
      chip.className = "filter-chip" + (historyFilter === o.id ? " active" : "");
      chip.textContent = o.label;
      chip.addEventListener("click", () => {
        historyFilter = o.id;
        renderHistory();
      });
      enableKeyboardActivation(chip);
      row.appendChild(chip);
    });
  }

  function sourceBadge(source) {
    if (source === "planned") return '<span class="badge-tag">Planned</span>';
    if (source === "imported") return '<span class="badge-tag">Imported</span>';
    return "";
  }

  function renderHistory() {
    renderFilters();
    const list = document.getElementById("history-list");
    const all = loadRoutes();
    document.getElementById("history-count").textContent = `${all.length} trail${all.length === 1 ? "" : "s"} saved`;
    const routes = historyFilter === "all" ? all : all.filter((r) => r.activity === historyFilter);

    if (routes.length === 0) {
      list.innerHTML = '<div class="empty-state">No trails saved yet.<br>Go to "Map" and record or plan a route.</div>';
      return;
    }
    list.innerHTML = "";
    routes.forEach((r) => {
      const meta = activityMeta(r.activity);
      const card = document.createElement("div");
      card.className = "route-card";
      card.innerHTML = `
        <div class="top">
          <div class="icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg></div>
          <div>
            <h3>${escapeHtml(r.name)}${sourceBadge(r.source)}</h3>
            <div class="meta">${formatDate(r.date)}</div>
          </div>
        </div>
        <div class="figures">
          <div><b>${formatKm(r.distance)}</b><span>Distance</span></div>
          <div><b>${r.elevGain !== null && r.elevGain !== undefined ? "+" + r.elevGain + " m" : "—"}</b><span>Elevation</span></div>
          <div><b>${formatDurationShort(r.duration)}</b><span>Duration</span></div>
        </div>
        <div class="row">
          <button class="btn-secondary btn-view" data-id="${r.id}">View map</button>
          <button class="btn-secondary btn-export" data-id="${r.id}">Export</button>
          <button class="btn-secondary btn-delete" data-id="${r.id}">Delete</button>
        </div>`;
      list.appendChild(card);
    });

    list.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => viewRoute(b.dataset.id)));
    list.querySelectorAll(".btn-export").forEach((b) => b.addEventListener("click", () => downloadGpx(b.dataset.id)));
    list.querySelectorAll(".btn-delete").forEach((b) =>
      b.addEventListener("click", () => {
        if (confirm("Delete this trail?")) {
          deleteRoute(b.dataset.id);
          renderHistory();
        }
      })
    );
  }

  let viewPolyline = null;
  function viewRoute(id) {
    const route = loadRoutes().find((r) => r.id === id);
    if (!route) return;
    viewingRouteId = id;

    switchView("map");
    if (currentMode === "plan") setMode("record");
    if (viewPolyline) map.removeLayer(viewPolyline);
    const latlngs = route.points.map((p) => [p.lat, p.lng]);
    const color = route.source === "planned" ? "#2f6b4f" : "#b3432c";
    viewPolyline = L.polyline(latlngs, { color, weight: 5, opacity: 0.9, dashArray: route.source === "planned" ? "1 8" : null }).addTo(map);
    map.fitBounds(viewPolyline.getBounds(), { padding: [30, 30] });

    document.getElementById("vr-title").textContent = route.name;
    const elevText = route.elevGain !== null && route.elevGain !== undefined ? ` · +${route.elevGain} m / -${route.elevLoss} m` : "";
    document.getElementById("vr-meta").textContent =
      `${formatDate(route.date)} · ${formatKm(route.distance)} · ${formatDurationShort(route.duration)}${elevText}`;
    document.getElementById("view-route-modal").classList.add("active");
  }

  document.getElementById("btn-close-view").addEventListener("click", () => {
    document.getElementById("view-route-modal").classList.remove("active");
    if (viewPolyline) {
      map.removeLayer(viewPolyline);
      viewPolyline = null;
    }
  });

  document.getElementById("btn-export-gpx").addEventListener("click", () => downloadGpx(viewingRouteId));

  function downloadGpx(id) {
    const route = loadRoutes().find((r) => r.id === id);
    if (!route) return;
    const gpx = buildGpx(route);
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = route.name.replace(/[^a-z0-9\-_ ]/gi, "") + ".gpx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // buildGpx lives in geo.js now.

  // ---------- Import GPX ----------
  document.getElementById("btn-import-gpx").addEventListener("click", () => {
    document.getElementById("file-import-gpx").click();
  });

  document.getElementById("file-import-gpx").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseGpx(reader.result);
        if (parsed.points.length < 2) {
          toast("This GPX file doesn't have enough track points to import.");
          return;
        }
        pendingImport = parsed;
        document.getElementById("import-name-input").value = parsed.name || file.name.replace(/\.gpx$/i, "");
        document.getElementById("import-activity-select").value = "trekking";
        document.getElementById("import-modal").classList.add("active");
      } catch (err) {
        toast("Couldn't read this GPX file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // parseGpx lives in geo.js now.

  document.getElementById("btn-import-cancel").addEventListener("click", () => {
    document.getElementById("import-modal").classList.remove("active");
    pendingImport = null;
  });

  document.getElementById("btn-import-confirm").addEventListener("click", () => {
    if (!pendingImport) return;
    const name = document.getElementById("import-name-input").value.trim() || "Imported trail";
    const activity = document.getElementById("import-activity-select").value;
    const pts = pendingImport.points;
    const hasAllTimes = pts.every((p) => p.t !== null) && !pendingImport.timeOrderIssue;
    const rawDuration = hasAllTimes && pts.length > 1 ? pts[pts.length - 1].t - pts[0].t : 0;
    const duration = Math.max(0, rawDuration);
    const elev = computeElevation(pts);
    const route = {
      id: "r_" + Date.now(),
      name,
      date: new Date().toISOString(),
      activity,
      source: "imported",
      points: pts,
      distance: totalDistance(pts),
      duration,
      elevGain: elev ? elev.gain : null,
      elevLoss: elev ? elev.loss : null,
    };
    const successMsg = pendingImport.timeOrderIssue
      ? "Trail imported (sin duración: el GPX tiene marcas de tiempo fuera de orden)."
      : "Trail imported!";
    const saved = trySaveRoute(route, successMsg);
    document.getElementById("import-modal").classList.remove("active");
    pendingImport = null;
    if (saved) renderHistory();
  });

  // ---------- Export all / restore backup ----------
  document.getElementById("btn-export-all").addEventListener("click", () => {
    const routes = loadRoutes();
    if (routes.length === 0) {
      toast("You don't have any trails to export yet.");
      return;
    }
    const backup = { app: "Senderos", version: 1, exportedAt: new Date().toISOString(), routes };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "senderos-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded.");
  });

  document.getElementById("btn-restore-backup").addEventListener("click", () => {
    document.getElementById("file-restore-backup").click();
  });

  document.getElementById("file-restore-backup").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!backup || !Array.isArray(backup.routes)) {
          toast("This doesn't look like a Senderos backup file.");
          return;
        }
        const validRoutes = backup.routes.filter(
          (r) => r && Array.isArray(r.points) && r.points.length >= 2 && typeof r.distance === "number" && typeof r.name === "string"
        );
        if (validRoutes.length === 0) {
          toast("No valid trails found in that backup file.");
          return;
        }
        const existing = loadRoutes();
        const skipped = backup.routes.length - validRoutes.length;
        const skippedNote = skipped > 0 ? ` (${skipped} entr${skipped === 1 ? "y" : "ies"} skipped as invalid)` : "";
        if (!confirm(`Add ${validRoutes.length} trail(s) from this backup to your ${existing.length} existing trail(s)?${skippedNote}`)) return;
        const withNewIds = validRoutes.map((r, i) => ({ ...r, id: "r_" + Date.now() + "_" + i }));
        saveRoutes([...withNewIds, ...existing]);
        toast("Backup restored!");
        renderHistory();
      } catch (err) {
        toast("Couldn't read this backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // ---------- Offline maps ----------
  function lon2tileX(lon, z) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  }
  function lat2tileY(lat, z) {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z));
  }
  function tilesForBounds(bounds, z) {
    const xmin = lon2tileX(bounds.getWest(), z);
    const xmax = lon2tileX(bounds.getEast(), z);
    const ymin = lat2tileY(bounds.getNorth(), z);
    const ymax = lat2tileY(bounds.getSouth(), z);
    const urls = [];
    for (let x = xmin; x <= xmax; x++) {
      for (let y = ymin; y <= ymax; y++) urls.push(TILE_URL(z, x, y));
    }
    return urls;
  }

  function loadOfflineAreas() {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_AREAS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveOfflineAreas(areas) {
    localStorage.setItem(OFFLINE_AREAS_KEY, JSON.stringify(areas));
  }

  function renderOfflineSummary() {
    const areas = loadOfflineAreas();
    const total = areas.reduce((sum, a) => sum + a.tileCount, 0);
    document.getElementById("offline-tile-count").textContent =
      total > 0 ? `${total} tiles (~${((total * 20) / 1024).toFixed(1)} MB)` : "0";
  }

  document.getElementById("btn-download-area").addEventListener("click", async () => {
    if (!("caches" in window)) {
      toast("Offline maps aren't supported in this browser.");
      return;
    }
    const bounds = map.getBounds();
    const z1 = map.getZoom();
    const z2 = Math.min(z1 + 1, 17);
    const tiles = Array.from(new Set([...tilesForBounds(bounds, z1), ...tilesForBounds(bounds, z2)]));

    const modal = document.getElementById("offline-modal");
    const body = document.getElementById("offline-modal-body");
    const confirmBtn = document.getElementById("btn-offline-confirm");
    document.getElementById("offline-modal-title").textContent = "Download this area?";
    document.getElementById("offline-progress-track").style.display = "none";

    if (tiles.length > MAX_OFFLINE_TILES) {
      body.textContent = `This area is too large (about ${tiles.length} tiles). Zoom in a bit and try again — downloads are capped to keep things light on the free map service.`;
      confirmBtn.style.display = "none";
    } else {
      body.textContent = `This will download about ${tiles.length} map tiles (~${((tiles.length * 20) / 1024).toFixed(1)} MB) for offline use around your current view.`;
      confirmBtn.style.display = "block";
      pendingOfflineTiles = tiles;
    }
    modal.classList.add("active");
  });

  document.getElementById("btn-offline-cancel").addEventListener("click", () => {
    document.getElementById("offline-modal").classList.remove("active");
  });

  document.getElementById("btn-offline-confirm").addEventListener("click", async () => {
    const tiles = pendingOfflineTiles;
    if (!tiles.length) return;
    const body = document.getElementById("offline-modal-body");
    const track = document.getElementById("offline-progress-track");
    const fill = document.getElementById("offline-progress-fill");
    const confirmBtn = document.getElementById("btn-offline-confirm");
    const cancelBtn = document.getElementById("btn-offline-cancel");
    document.getElementById("offline-modal-title").textContent = "Downloading…";
    confirmBtn.style.display = "none";
    cancelBtn.style.display = "none";
    track.style.display = "block";
    fill.style.width = "0%";

    try {
      const cache = await caches.open(OFFLINE_CACHE);
      let done = 0;
      let succeeded = 0;
      const CONCURRENCY = 6;
      let idx = 0;
      async function worker() {
        while (idx < tiles.length) {
          const url = tiles[idx++];
          try {
            const cached = await cache.match(url);
            if (cached) {
              succeeded++;
            } else {
              const res = await fetch(url);
              if (res && res.ok) {
                await cache.put(url, res.clone());
                succeeded++;
              }
            }
          } catch (e) {
            /* skip failed tile, keep going */
          }
          done++;
          body.textContent = `${done} / ${tiles.length} tiles`;
          fill.style.width = Math.round((done / tiles.length) * 100) + "%";
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (succeeded > 0) {
        const areas = loadOfflineAreas();
        areas.push({ id: "a_" + Date.now(), tileCount: succeeded, downloadedAt: new Date().toISOString() });
        saveOfflineAreas(areas);
        renderOfflineSummary();
        toast(succeeded === tiles.length ? "Offline area saved!" : `Offline area saved (${succeeded}/${tiles.length} tiles — check your connection and retry for the rest).`);
      } else {
        toast("Couldn't download tiles — check your internet connection and try again.");
      }
    } catch (e) {
      toast("Something went wrong downloading this area.");
    }

    cancelBtn.style.display = "block";
    cancelBtn.textContent = "Done";
    document.getElementById("offline-modal").classList.remove("active");
    cancelBtn.textContent = "Cancel";
    pendingOfflineTiles = [];
  });

  document.getElementById("btn-clear-offline").addEventListener("click", async () => {
    if (!confirm("Delete all downloaded offline map tiles?")) return;
    if ("caches" in window) await caches.delete(OFFLINE_CACHE);
    saveOfflineAreas([]);
    renderOfflineSummary();
    toast("Offline maps cleared.");
  });

  // ---------- Local map file (.pmtiles) ----------
  function loadLocalMapMeta() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_MAP_META_KEY) || "null");
    } catch (e) {
      return null;
    }
  }
  function saveLocalMapMeta(meta) {
    if (meta) localStorage.setItem(LOCAL_MAP_META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(LOCAL_MAP_META_KEY);
  }

  function renderLocalMapSummary(statusText) {
    const summary = document.getElementById("local-map-summary");
    const nameEl = document.getElementById("local-map-name");
    const statusEl = document.getElementById("local-map-status");
    const meta = loadLocalMapMeta();
    if (!meta) {
      summary.style.display = "none";
      return;
    }
    summary.style.display = "flex";
    nameEl.textContent = meta.name;
    statusEl.textContent = statusText || (localMapLayer ? (localMapVisible ? "Loaded" : "Hidden") : "Tap Import to load again");
  }

  let importPmtilesSeq = 0;
  const pmtilesLibAvailable = typeof pmtiles !== "undefined";
  if (!pmtilesLibAvailable) document.getElementById("btn-import-pmtiles").disabled = true;

  document.getElementById("btn-import-pmtiles").addEventListener("click", () => {
    if (!pmtilesLibAvailable) {
      toast("Local map support failed to load. Try reloading the app.");
      return;
    }
    document.getElementById("file-import-pmtiles").click();
  });

  document.getElementById("file-import-pmtiles").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const seq = ++importPmtilesSeq;
    const importBtn = document.getElementById("btn-import-pmtiles");
    importBtn.disabled = true;
    toast("Reading map file…");

    try {
      let header;
      let instance;
      try {
        instance = new pmtiles.PMTiles(new pmtiles.FileSource(file));
        header = await instance.getHeader();
      } catch (err) {
        toast("Couldn't read this file — it doesn't look like a valid .pmtiles archive.");
        return;
      }
      if (seq !== importPmtilesSeq) return; // a newer import started while we were reading this one

      const RASTER_TYPES = [pmtiles.TileType.Png, pmtiles.TileType.Jpeg, pmtiles.TileType.Webp, pmtiles.TileType.Avif];
      if (header.tileType === pmtiles.TileType.Mvt || header.tileType === pmtiles.TileType.Mlt) {
        toast("This is a vector map file — Senderos only supports raster (image-tile) .pmtiles files.");
        return;
      }
      if (!RASTER_TYPES.includes(header.tileType)) {
        toast("This .pmtiles file uses a tile format Senderos doesn't recognize.");
        return;
      }

      let newLayer;
      try {
        const nativeMinZoom = Number.isFinite(header.minZoom) ? header.minZoom : 0;
        const nativeMaxZoom = Number.isFinite(header.maxZoom) ? header.maxZoom : 19;
        newLayer = pmtiles.leafletRasterLayer(instance, {
          attribution: `Local map: ${file.name}`,
          minZoom: nativeMinZoom,
          maxZoom: 19,
          maxNativeZoom: nativeMaxZoom,
          minNativeZoom: nativeMinZoom,
        });
      } catch (err) {
        toast("Couldn't build a map layer from this file.");
        return;
      }
      if (seq !== importPmtilesSeq) return;

      // Only touch existing state once the new layer is confirmed to exist.
      if (localMapLayer) map.removeLayer(localMapLayer);
      localMapLayer = newLayer;
      localMapVisible = true;
      localMapLayer.addTo(map);

      const toggleBtn = document.getElementById("btn-local-map-toggle");
      toggleBtn.style.display = "flex";
      toggleBtn.classList.add("active");

      saveLocalMapMeta({ name: file.name, importedAt: new Date().toISOString() });
      renderLocalMapSummary("Loaded");

      const hasValidBounds = header.maxLat > header.minLat && header.maxLon > header.minLon;

      // Importing happens from Settings, where the map container is hidden (0x0), so
      // switch to the Map view and let it settle before invalidating size / fitting bounds.
      switchView("map");
      setTimeout(() => {
        map.invalidateSize();
        if (hasValidBounds) {
          try {
            map.fitBounds([[header.minLat, header.minLon], [header.maxLat, header.maxLon]]);
          } catch (err) {
            /* ignore invalid bounds */
          }
        }
      }, 80);

      toast(hasValidBounds
        ? `"${file.name}" loaded as a map layer.`
        : `"${file.name}" loaded, but it doesn't list a coverage area — pan/zoom to find it.`);
    } finally {
      if (seq === importPmtilesSeq) importBtn.disabled = false;
    }
  });

  document.getElementById("btn-local-map-toggle").addEventListener("click", () => {
    if (!localMapLayer) return;
    localMapVisible = !localMapVisible;
    if (localMapVisible) {
      localMapLayer.addTo(map);
      toast("Showing local map");
    } else {
      map.removeLayer(localMapLayer);
    }
    document.getElementById("btn-local-map-toggle").classList.toggle("active", localMapVisible);
    renderLocalMapSummary();
  });

  // ---------- Settings: clear routes ----------
  document.getElementById("btn-clear-data").addEventListener("click", () => {
    if (confirm("This deletes every trail saved on this device. Are you sure?")) {
      localStorage.removeItem(STORAGE_KEY);
      toast("Trails deleted.");
      renderHistory();
    }
  });

  // ---------- Stats ----------
  const ICONS = {
    distance: '<path d="M4 19 L9 6 L14 15 L17 10 L20 19"/><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="17" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
    pace: '<path d="M13 2 L4 14 h6 l-1 8 9 -12 h-6 Z"/>',
    elevation: '<path d="M3 20 L9.5 7 L13 13.5 L15.3 10 L21 20 Z"/>',
    duration: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  };

  function startOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function startOfYear(d) {
    return new Date(d.getFullYear(), 0, 1);
  }

  function periodTotals(routes, since) {
    const inPeriod = routes.filter((r) => new Date(r.date) >= since);
    const distance = inPeriod.reduce((sum, r) => sum + (r.distance || 0), 0);
    const duration = inPeriod.reduce((sum, r) => sum + (r.duration || 0), 0);
    const hasElev = inPeriod.some((r) => r.elevGain !== null && r.elevGain !== undefined);
    const elevGain = hasElev ? inPeriod.reduce((sum, r) => sum + (r.elevGain || 0), 0) : null;
    return { count: inPeriod.length, distance, duration, elevGain };
  }

  function periodCard(title, totals) {
    return `
      <div class="period-card">
        <div class="period-title">${title} <span style="color:var(--muted);font-weight:500;">· ${totals.count} trail${totals.count === 1 ? "" : "s"}</span></div>
        <div class="figures">
          <div><b>${formatKm(totals.distance)}</b><span>Distance</span></div>
          <div><b>${formatDurationShort(totals.duration)}</b><span>Time</span></div>
          <div><b>${totals.elevGain !== null ? "+" + Math.round(totals.elevGain) + " m" : "—"}</b><span>Elevation</span></div>
        </div>
      </div>`;
  }

  function renderStats() {
    const el = document.getElementById("stats-content");
    const all = loadRoutes();

    if (all.length === 0) {
      el.innerHTML = '<div class="empty-state">No trails saved yet.<br>Your averages, totals, and personal records will show up here once you save a trail.</div>';
      return;
    }

    let html = "";

    // Averages by activity
    html += '<div class="stats-section"><div class="stats-section-title">Average pace</div>';
    ACTIVITIES.forEach((a) => {
      const qualifying = all.filter((r) => r.activity === a.id && r.duration > 0 && r.distance >= 20);
      const dist = qualifying.reduce((s, r) => s + r.distance, 0);
      const dur = qualifying.reduce((s, r) => s + r.duration, 0);
      const paceText = qualifying.length > 0 ? formatPace(dist, dur) + " /km" : "No data yet";
      html += `
        <div class="pace-row">
          <div class="icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg></div>
          <div class="label">${a.label}</div>
          <div class="value${qualifying.length > 0 ? "" : " muted"}">${paceText}</div>
        </div>`;
    });
    html += "</div>";

    // Totals by period
    const now = new Date();
    html += '<div class="stats-section"><div class="stats-section-title">Totals</div>';
    html += periodCard("This week", periodTotals(all, startOfWeek(now)));
    html += periodCard("This month", periodTotals(all, startOfMonth(now)));
    html += periodCard("This year", periodTotals(all, startOfYear(now)));
    html += "</div>";

    // Personal records
    const withDistance = all.filter((r) => r.distance > 0);
    const withPace = all.filter((r) => r.duration > 0 && r.distance >= 500);
    const withElev = all.filter((r) => r.elevGain !== null && r.elevGain !== undefined);
    const withDuration = all.filter((r) => r.duration > 0);

    const records = [];
    if (withDistance.length) {
      const r = withDistance.reduce((best, r2) => (r2.distance > best.distance ? r2 : best));
      records.push({ icon: ICONS.distance, label: "Longest distance", value: formatKm(r.distance), route: r });
    }
    if (withPace.length) {
      const r = withPace.reduce((best, r2) => (r2.distance / r2.duration > best.distance / best.duration ? r2 : best));
      records.push({ icon: ICONS.pace, label: "Fastest pace", value: formatPace(r.distance, r.duration) + " /km", route: r });
    }
    if (withElev.length) {
      const r = withElev.reduce((best, r2) => (r2.elevGain > best.elevGain ? r2 : best));
      records.push({ icon: ICONS.elevation, label: "Biggest elevation gain", value: "+" + r.elevGain + " m", route: r });
    }
    if (withDuration.length) {
      const r = withDuration.reduce((best, r2) => (r2.duration > best.duration ? r2 : best));
      records.push({ icon: ICONS.duration, label: "Longest duration", value: formatDurationShort(r.duration), route: r });
    }

    if (records.length > 0) {
      html += '<div class="stats-section"><div class="stats-section-title">Personal records</div>';
      records.forEach((rec, i) => {
        html += `
          <div class="record-card" data-record-idx="${i}">
            <div class="icon-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${rec.icon}</svg></div>
            <div>
              <div class="label">${rec.label}</div>
              <div class="value">${rec.value}</div>
              <div class="sub">${escapeHtml(rec.route.name)} · ${formatDate(rec.route.date)}</div>
            </div>
          </div>`;
      });
      html += "</div>";

      el.innerHTML = html;
      el.querySelectorAll(".record-card").forEach((card) => {
        const rec = records[Number(card.dataset.recordIdx)];
        card.addEventListener("click", () => viewRoute(rec.route.id));
      });
      return;
    }

    el.innerHTML = html;
  }

  // ---------- View navigation ----------
  function switchView(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById("view-" + view).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "map") setTimeout(() => map.invalidateSize(), 50);
    if (view === "history") renderHistory();
    if (view === "settings") {
      renderThemeOptions();
      renderOfflineSummary();
      renderLocalMapSummary();
    }
    if (view === "stats") renderStats();
  }

  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

  window.addEventListener("beforeunload", (e) => {
    if (recording) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ---------- Init ----------
  applyTheme(localStorage.getItem(THEME_KEY) || "green");
  renderActivityRow();
  initMap();
  tryRecoverActiveRecording();
  renderHistory();
  renderOfflineSummary();
  renderLocalMapSummary();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
