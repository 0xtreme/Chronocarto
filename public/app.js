/* ================================================================== */
/*  Chronocarto — app.js                                              */
/*  Map-first atlas of human conflict                                 */
/* ================================================================== */

(() => {
  "use strict";

  /* ── Colour map for conflict types ────────────────────────────── */
  const TYPE_COLOURS = {
    interstate:  "#e94560",
    civil:       "#f5a623",
    religious:   "#9b59b6",
    insurgency:  "#3498db",
    genocide:    "#ff2d2d",
    colonial:    "#1abc9c",
    raid:        "#95a5a6",
    succession:  "#e67e22",
  };

  /* ── Casualty slider thresholds ───────────────────────────────── */
  const CAS_STEPS = [0, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];
  const CAS_LABELS = ["Any", "1 k", "5 k", "10 k", "50 k", "100 k", "500 k", "1 M"];

  /* ── Date helpers ─────────────────────────────────────────────── */
  const MIN_YEAR = -3000;
  const MAX_YEAR = 2026;

  function fmtYear(y) {
    if (y <= 0) return `${Math.abs(y)} BCE`;
    return `${y} CE`;
  }

  /* ── State ────────────────────────────────────────────────────── */
  let allEvents = [];
  let filteredGeoJSON = null;
  let activeTypes = new Set(Object.keys(TYPE_COLOURS));
  let minCasualties = 0;
  let rangeStart = MIN_YEAR;
  let rangeEnd = MAX_YEAR;
  let playing = false;
  let playSpeed = 1;         // years per tick
  let playInterval = null;
  const PLAY_SPEEDS = [1, 5, 10, 25, 50, 100];
  let speedIdx = 0;

  /* ── DOM refs ─────────────────────────────────────────────────── */
  const $rangeStart   = document.getElementById("range-start");
  const $rangeEnd     = document.getElementById("range-end");
  const $highlight    = document.getElementById("range-highlight");
  const $readoutStart = document.getElementById("readout-start");
  const $readoutEnd   = document.getElementById("readout-end");
  const $countNum     = document.getElementById("count-num");
  const $playBtn      = document.getElementById("play-btn");
  const $speedLabel   = document.getElementById("speed-label");
  const $detailPanel  = document.getElementById("detail-panel");
  const $casualtySlider = document.getElementById("casualty-slider");
  const $casualtyLabel  = document.getElementById("casualty-label");

  /* ── Map setup ────────────────────────────────────────────────── */
  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Chronocarto Dark",
      sources: {
        "carto-dark": {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
            "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxzoom: 18,
        },
      },
      layers: [
        {
          id: "carto-dark-layer",
          type: "raster",
          source: "carto-dark",
          paint: { "raster-opacity": 0.85, "raster-saturation": -0.4 },
        },
      ],
    },
    center: [30, 25],
    zoom: 2.2,
    minZoom: 1.5,
    maxZoom: 14,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  /* ── Init timeline sliders ────────────────────────────────────── */
  function initSliders() {
    [$rangeStart, $rangeEnd].forEach((el) => {
      el.min = MIN_YEAR;
      el.max = MAX_YEAR;
    });
    $rangeStart.value = MIN_YEAR;
    $rangeEnd.value = MAX_YEAR;
    updateReadout();
    buildTimelineLabels();
  }

  function buildTimelineLabels() {
    const $labels = document.getElementById("timeline-labels");
    const ticks = [-3000, -2000, -1000, 0, 500, 1000, 1500, 1800, 1900, 2000];
    $labels.innerHTML = ticks.map((y) => `<span>${fmtYear(y)}</span>`).join("");
  }

  function updateReadout() {
    rangeStart = +$rangeStart.value;
    rangeEnd = +$rangeEnd.value;
    // Enforce start < end
    if (rangeStart > rangeEnd) {
      if (this === $rangeStart) { $rangeStart.value = rangeEnd; rangeStart = rangeEnd; }
      else { $rangeEnd.value = rangeStart; rangeEnd = rangeStart; }
    }
    $readoutStart.textContent = fmtYear(rangeStart);
    $readoutEnd.textContent = fmtYear(rangeEnd);
    updateHighlight();
  }

  function updateHighlight() {
    const total = MAX_YEAR - MIN_YEAR;
    const left = ((rangeStart - MIN_YEAR) / total) * 100;
    const right = ((rangeEnd - MIN_YEAR) / total) * 100;
    $highlight.style.left = `${left}%`;
    $highlight.style.width = `${right - left}%`;
  }

  /* ── Filter chips ─────────────────────────────────────────────── */
  function buildTypeFilters() {
    const $group = document.getElementById("type-filters");
    Object.keys(TYPE_COLOURS).forEach((type) => {
      const btn = document.createElement("button");
      btn.className = "chip active";
      btn.textContent = type;
      btn.style.background = TYPE_COLOURS[type];
      btn.style.borderColor = TYPE_COLOURS[type];
      btn.dataset.type = type;
      btn.addEventListener("click", () => {
        if (activeTypes.has(type)) {
          activeTypes.delete(type);
          btn.classList.remove("active");
          btn.style.background = "transparent";
          btn.style.color = TYPE_COLOURS[type];
        } else {
          activeTypes.add(type);
          btn.classList.add("active");
          btn.style.background = TYPE_COLOURS[type];
          btn.style.color = "#fff";
        }
        applyFilters();
      });
      $group.appendChild(btn);
    });
  }

  /* ── Casualty slider ──────────────────────────────────────────── */
  $casualtySlider.addEventListener("input", () => {
    const idx = +$casualtySlider.value;
    minCasualties = CAS_STEPS[idx];
    $casualtyLabel.textContent = CAS_LABELS[idx];
    applyFilters();
  });

  /* ── Era presets ──────────────────────────────────────────────── */
  document.querySelectorAll("#era-presets button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#era-presets button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $rangeStart.value = btn.dataset.start;
      $rangeEnd.value = btn.dataset.end;
      updateReadout();
      applyFilters();
    });
  });

  /* ── Play / pause ─────────────────────────────────────────────── */
  function togglePlay() {
    playing = !playing;
    $playBtn.classList.toggle("playing", playing);
    $playBtn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
    if (playing) {
      // If at the end, reset
      if (+$rangeStart.value >= MAX_YEAR - 50) {
        $rangeStart.value = MIN_YEAR;
        $rangeEnd.value = MIN_YEAR + 200;
      }
      playInterval = setInterval(() => {
        let s = +$rangeStart.value + playSpeed;
        let e = +$rangeEnd.value + playSpeed;
        if (e > MAX_YEAR) { e = MAX_YEAR; s = Math.min(s, e); togglePlay(); }
        $rangeStart.value = s;
        $rangeEnd.value = e;
        updateReadout();
        applyFilters();
      }, 60);
    } else {
      clearInterval(playInterval);
    }
  }

  $playBtn.addEventListener("click", togglePlay);

  $speedLabel.addEventListener("click", () => {
    speedIdx = (speedIdx + 1) % PLAY_SPEEDS.length;
    playSpeed = PLAY_SPEEDS[speedIdx];
    $speedLabel.textContent = `${playSpeed}\u00d7`;
  });

  /* ── Detail panel ─────────────────────────────────────────────── */
  function showDetail(ev) {
    $detailPanel.classList.remove("hidden");
    // Hide era presets when detail is open
    document.getElementById("era-presets").style.display = "none";

    document.getElementById("detail-name").textContent = ev.canonical_name;

    const colour = TYPE_COLOURS[ev.conflict_type] || "#888";

    let metaHTML = `<div class="label">Period</div>
      <div class="value">${fmtYear(ev.start_date)} — ${fmtYear(ev.end_date)}</div>`;
    metaHTML += `<div class="label" style="margin-top:8px">Type</div>
      <div class="value"><span class="type-badge" style="background:${colour}">${ev.conflict_type}</span></div>`;
    if (ev.casualties_low != null || ev.casualties_high != null) {
      const lo = ev.casualties_low != null ? ev.casualties_low.toLocaleString() : "?";
      const hi = ev.casualties_high != null ? ev.casualties_high.toLocaleString() : "?";
      metaHTML += `<div class="label" style="margin-top:8px">Est. Casualties</div>
        <div class="value">${lo} — ${hi}</div>`;
    }
    if (ev.date_uncertainty !== "exact") {
      metaHTML += `<div class="value" style="margin-top:4px;font-style:italic;color:var(--text-muted)">Date: ${ev.date_uncertainty}</div>`;
    }
    document.getElementById("detail-meta").innerHTML = metaHTML;

    let partiesHTML = '<div class="label">Belligerents</div><div class="value">';
    (ev.parties || []).forEach((p) => {
      partiesHTML += `<div>${p.name} <span style="color:var(--text-muted)">(${p.role})</span></div>`;
    });
    partiesHTML += "</div>";
    document.getElementById("detail-parties").innerHTML = partiesHTML;

    document.getElementById("detail-summary").textContent = ev.summary || "";

    let tagsHTML = '<div class="label">Tags</div><div class="value">';
    (ev.tags || []).forEach((t) => { tagsHTML += `<span class="tag">${t}</span>`; });
    tagsHTML += "</div>";
    document.getElementById("detail-sources").innerHTML = tagsHTML;
  }

  document.getElementById("detail-close").addEventListener("click", () => {
    $detailPanel.classList.add("hidden");
    document.getElementById("era-presets").style.display = "";
  });

  /* ── Data loading ─────────────────────────────────────────────── */
  async function loadData() {
    const resp = await fetch("data/conflicts.json");
    allEvents = await resp.json();
    initMap();
  }

  /* ── Build GeoJSON ────────────────────────────────────────────── */
  function buildGeoJSON(events) {
    return {
      type: "FeatureCollection",
      features: events.map((ev) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [ev.longitude, ev.latitude] },
        properties: {
          id: ev.event_id,
          name: ev.canonical_name,
          type: ev.conflict_type,
          start: ev.start_date,
          end: ev.end_date,
          cas_low: ev.casualties_low,
          cas_high: ev.casualties_high,
          colour: TYPE_COLOURS[ev.conflict_type] || "#888",
          radius: casualtyRadius(ev.casualties_high),
        },
      })),
    };
  }

  function casualtyRadius(cas) {
    if (cas == null || cas <= 0) return 5;
    // Log scale: 1k→6, 10k→8, 100k→12, 1M→16, 10M→22
    return Math.min(5 + Math.log10(cas) * 2.8, 28);
  }

  /* ── Filter logic ─────────────────────────────────────────────── */
  function applyFilters() {
    const filtered = allEvents.filter((ev) => {
      // Time window: event overlaps with [rangeStart, rangeEnd]
      if (ev.end_date < rangeStart || ev.start_date > rangeEnd) return false;
      // Type
      if (!activeTypes.has(ev.conflict_type)) return false;
      // Casualties
      if (minCasualties > 0) {
        const cas = ev.casualties_high || ev.casualties_low || 0;
        if (cas < minCasualties) return false;
      }
      return true;
    });

    filteredGeoJSON = buildGeoJSON(filtered);
    $countNum.textContent = filtered.length;

    const src = map.getSource("conflicts");
    if (src) src.setData(filteredGeoJSON);
  }

  /* ── Map layers ───────────────────────────────────────────────── */
  function initMap() {
    filteredGeoJSON = buildGeoJSON(allEvents);
    $countNum.textContent = allEvents.length;

    map.addSource("conflicts", {
      type: "geojson",
      data: filteredGeoJSON,
    });

    // Heatmap layer — visible at low zoom
    map.addLayer({
      id: "conflicts-heat",
      type: "heatmap",
      source: "conflicts",
      maxzoom: 7,
      paint: {
        "heatmap-weight": [
          "interpolate", ["linear"],
          ["coalesce", ["get", "cas_high"], 1000],
          0, 0.1,
          1000, 0.3,
          10000, 0.5,
          100000, 0.8,
          1000000, 1,
        ],
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          1, 0.6,
          5, 1.2,
          7, 1.5,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0,    "rgba(0, 0, 0, 0)",
          0.15, "rgba(89, 40, 90, 0.4)",
          0.3,  "rgba(158, 40, 80, 0.55)",
          0.5,  "rgba(213, 60, 70, 0.65)",
          0.7,  "rgba(240, 120, 50, 0.75)",
          0.9,  "rgba(255, 200, 50, 0.85)",
          1,    "rgba(255, 255, 200, 0.95)",
        ],
        "heatmap-radius": [
          "interpolate", ["linear"], ["zoom"],
          1, 15,
          3, 25,
          5, 40,
          7, 55,
        ],
        "heatmap-opacity": [
          "interpolate", ["linear"], ["zoom"],
          5, 0.9,
          7, 0,
        ],
      },
    });

    // Circle layer — visible at higher zoom
    map.addLayer({
      id: "conflicts-circle",
      type: "circle",
      source: "conflicts",
      minzoom: 4,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, ["*", ["get", "radius"], 0.5],
          8, ["*", ["get", "radius"], 1],
          12, ["*", ["get", "radius"], 1.5],
        ],
        "circle-color": ["get", "colour"],
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          4, 0,
          5.5, 0.75,
          8, 0.85,
        ],
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(255,255,255,0.25)",
        "circle-blur": 0.15,
      },
    });

    // Symbol layer for labels at high zoom
    map.addLayer({
      id: "conflicts-label",
      type: "symbol",
      source: "conflicts",
      minzoom: 6,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-max-width": 12,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#d0d0d8",
        "text-halo-color": "rgba(15, 15, 30, 0.9)",
        "text-halo-width": 1.5,
        "text-opacity": [
          "interpolate", ["linear"], ["zoom"],
          6, 0,
          7, 1,
        ],
      },
    });

    // Click → detail
    map.on("click", "conflicts-circle", (e) => {
      const props = e.features[0].properties;
      const ev = allEvents.find((d) => d.event_id === props.id);
      if (ev) showDetail(ev);
    });

    // Hover cursor
    map.on("mouseenter", "conflicts-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "conflicts-circle", () => { map.getCanvas().style.cursor = ""; });

    // Tooltip on hover
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "conflict-popup",
      offset: 12,
    });

    map.on("mouseenter", "conflicts-circle", (e) => {
      const f = e.features[0];
      const cas = f.properties.cas_high
        ? Number(f.properties.cas_high).toLocaleString()
        : "unknown";
      popup
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<strong>${f.properties.name}</strong><br><span style="color:${f.properties.colour}">${f.properties.type}</span> &middot; ${cas} est. casualties`)
        .addTo(map);
    });
    map.on("mouseleave", "conflicts-circle", () => popup.remove());

    applyFilters();
  }

  /* ── Timeline input handlers ──────────────────────────────────── */
  $rangeStart.addEventListener("input", function () {
    updateReadout.call(this);
    clearEraActive();
    applyFilters();
  });
  $rangeEnd.addEventListener("input", function () {
    updateReadout.call(this);
    clearEraActive();
    applyFilters();
  });

  function clearEraActive() {
    document.querySelectorAll("#era-presets button").forEach((b) => b.classList.remove("active"));
  }

  /* ── Keyboard shortcuts ───────────────────────────────────────── */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const step = e.shiftKey ? 50 : 10;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        $rangeStart.value = Math.max(MIN_YEAR, +$rangeStart.value - step);
        $rangeEnd.value = Math.max(MIN_YEAR, +$rangeEnd.value - step);
        updateReadout();
        clearEraActive();
        applyFilters();
        break;
      case "ArrowRight":
        e.preventDefault();
        $rangeStart.value = Math.min(MAX_YEAR, +$rangeStart.value + step);
        $rangeEnd.value = Math.min(MAX_YEAR, +$rangeEnd.value + step);
        updateReadout();
        clearEraActive();
        applyFilters();
        break;
      case " ":
        e.preventDefault();
        togglePlay();
        break;
    }
  });

  /* ── Escape closes detail panel ──────────────────────────────── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $detailPanel.classList.add("hidden");
      document.getElementById("era-presets").style.display = "";
    }
  });

  /* ── Boot ─────────────────────────────────────────────────────── */
  initSliders();
  buildTypeFilters();
  map.on("load", loadData);
})();
