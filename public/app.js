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
  const YEAR_SPAN = MAX_YEAR - MIN_YEAR;

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
  let playSpeed = 10;
  let playInterval = null;
  const PLAY_SPEEDS = [5, 10, 25, 50, 100, 200];
  let speedIdx = 1;

  /* ── DOM refs ─────────────────────────────────────────────────── */
  const $readoutStart = document.getElementById("readout-start");
  const $readoutEnd   = document.getElementById("readout-end");
  const $countNum     = document.getElementById("count-num");
  const $playBtn      = document.getElementById("play-btn");
  const $speedLabel   = document.getElementById("speed-label");
  const $detailPanel  = document.getElementById("detail-panel");
  const $casualtySlider = document.getElementById("casualty-slider");
  const $casualtyLabel  = document.getElementById("casualty-label");

  /* ── Custom dual-thumb slider ─────────────────────────────────── */
  const $track      = document.getElementById("timeline-track");
  const $thumbStart = document.getElementById("thumb-start");
  const $thumbEnd   = document.getElementById("thumb-end");
  const $highlight  = document.getElementById("range-highlight");
  let dragging = null; // "start" | "end" | "range" | null
  let dragStartX = 0;
  let dragStartVal = 0;
  let dragEndVal = 0;

  function yearToPercent(y) { return ((y - MIN_YEAR) / YEAR_SPAN) * 100; }
  function percentToYear(p) { return Math.round(MIN_YEAR + (p / 100) * YEAR_SPAN); }

  function updateSliderUI() {
    const pStart = yearToPercent(rangeStart);
    const pEnd = yearToPercent(rangeEnd);
    $thumbStart.style.left = `${pStart}%`;
    $thumbEnd.style.left = `${pEnd}%`;
    $highlight.style.left = `${pStart}%`;
    $highlight.style.width = `${Math.max(0.5, pEnd - pStart)}%`;
    $readoutStart.textContent = fmtYear(rangeStart);
    $readoutEnd.textContent = fmtYear(rangeEnd);

    // When the range is narrow (e.g. during play), merge thumbs visually
    const narrow = (pEnd - pStart) < 3;
    $thumbStart.classList.toggle("merged", narrow);
    $thumbEnd.classList.toggle("merged", narrow);
  }

  function getTrackX(e) {
    const rect = $track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }

  function onPointerDown(e) {
    e.preventDefault();
    const pct = getTrackX(e);
    const pStart = yearToPercent(rangeStart);
    const pEnd = yearToPercent(rangeEnd);
    const distStart = Math.abs(pct - pStart);
    const distEnd = Math.abs(pct - pEnd);

    // If clicking between thumbs, drag the whole range
    if (pct > pStart + 2 && pct < pEnd - 2 && distStart > 3 && distEnd > 3) {
      dragging = "range";
      dragStartX = pct;
      dragStartVal = rangeStart;
      dragEndVal = rangeEnd;
    } else if (distStart <= distEnd) {
      dragging = "start";
    } else {
      dragging = "end";
    }

    onPointerMove(e);
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("touchend", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const pct = getTrackX(e);

    if (dragging === "start") {
      rangeStart = Math.min(percentToYear(pct), rangeEnd - 10);
    } else if (dragging === "end") {
      rangeEnd = Math.max(percentToYear(pct), rangeStart + 10);
    } else if (dragging === "range") {
      const delta = percentToYear(pct) - percentToYear(dragStartX);
      let newStart = dragStartVal + delta;
      let newEnd = dragEndVal + delta;
      if (newStart < MIN_YEAR) { newEnd += MIN_YEAR - newStart; newStart = MIN_YEAR; }
      if (newEnd > MAX_YEAR) { newStart -= newEnd - MAX_YEAR; newEnd = MAX_YEAR; }
      rangeStart = Math.max(MIN_YEAR, newStart);
      rangeEnd = Math.min(MAX_YEAR, newEnd);
    }

    updateSliderUI();
    clearEraActive();
    applyFilters();
  }

  function onPointerUp() {
    dragging = null;
    document.removeEventListener("mousemove", onPointerMove);
    document.removeEventListener("mouseup", onPointerUp);
    document.removeEventListener("touchmove", onPointerMove);
    document.removeEventListener("touchend", onPointerUp);
  }

  $track.addEventListener("mousedown", onPointerDown);
  $track.addEventListener("touchstart", onPointerDown, { passive: false });

  // Also handle thumb-specific drags
  $thumbStart.addEventListener("mousedown", (e) => { e.stopPropagation(); dragging = "start"; onPointerDown(e); });
  $thumbEnd.addEventListener("mousedown", (e) => { e.stopPropagation(); dragging = "end"; onPointerDown(e); });

  function initSlider() {
    rangeStart = MIN_YEAR;
    rangeEnd = MAX_YEAR;
    updateSliderUI();
    buildTimelineLabels();
  }

  function buildTimelineLabels() {
    const $labels = document.getElementById("timeline-labels");
    const ticks = [-3000, -2000, -1000, 0, 500, 1000, 1500, 1800, 1900, 2000];
    $labels.innerHTML = ticks.map((y) => `<span>${fmtYear(y)}</span>`).join("");
  }

  /* ── Map setup ────────────────────────────────────────────────── */
  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Chronocarto Dark",
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
    renderWorldCopies: false,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  /* ── Filter chips ─────────────────────────────────────────────── */
  function buildTypeFilters() {
    const $group = document.getElementById("type-filters");

    // Select all / none toggle buttons
    const $toggleRow = document.getElementById("filter-toggle");
    const $selectAll = document.createElement("button");
    $selectAll.className = "filter-action";
    $selectAll.textContent = "All";
    $selectAll.addEventListener("click", () => {
      Object.keys(TYPE_COLOURS).forEach((t) => activeTypes.add(t));
      syncChipStates();
      applyFilters();
    });
    const $selectNone = document.createElement("button");
    $selectNone.className = "filter-action";
    $selectNone.textContent = "None";
    $selectNone.addEventListener("click", () => {
      activeTypes.clear();
      syncChipStates();
      applyFilters();
    });
    $toggleRow.appendChild($selectAll);
    $toggleRow.appendChild($selectNone);

    // Individual type chips
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
        } else {
          activeTypes.add(type);
        }
        syncChipStates();
        applyFilters();
      });
      $group.appendChild(btn);
    });
  }

  function syncChipStates() {
    document.querySelectorAll("#type-filters .chip").forEach((btn) => {
      const type = btn.dataset.type;
      if (activeTypes.has(type)) {
        btn.classList.add("active");
        btn.style.background = TYPE_COLOURS[type];
        btn.style.color = "#fff";
      } else {
        btn.classList.remove("active");
        btn.style.background = "transparent";
        btn.style.color = TYPE_COLOURS[type];
      }
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
      rangeStart = +btn.dataset.start;
      rangeEnd = +btn.dataset.end;
      updateSliderUI();
      applyFilters();
    });
  });

  /* ── Play / pause ─────────────────────────────────────────────── */
  function togglePlay() {
    playing = !playing;
    $playBtn.classList.toggle("playing", playing);
    $playBtn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
    if (playing) {
      // Use a moving 100-year window
      const windowSize = 100;
      // If showing all time, start from the beginning with a window
      if (rangeEnd - rangeStart > 1000) {
        rangeStart = MIN_YEAR;
        rangeEnd = MIN_YEAR + windowSize;
        updateSliderUI();
        applyFilters();
      }
      // If at the end, reset
      if (rangeEnd >= MAX_YEAR - 20) {
        rangeStart = MIN_YEAR;
        rangeEnd = MIN_YEAR + windowSize;
      }
      playInterval = setInterval(() => {
        rangeStart += playSpeed;
        rangeEnd += playSpeed;
        if (rangeEnd >= MAX_YEAR) {
          rangeEnd = MAX_YEAR;
          rangeStart = MAX_YEAR - windowSize;
          togglePlay(); // stop
        }
        updateSliderUI();
        clearEraActive();
        applyFilters();
      }, 50);
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

    // Wikipedia link
    const wikiQuery = encodeURIComponent(ev.canonical_name);
    tagsHTML += `<div style="margin-top:10px"><a class="wiki-link" href="https://en.wikipedia.org/w/index.php?search=${wikiQuery}" target="_blank" rel="noopener">Read more on Wikipedia &rarr;</a></div>`;

    // Source
    tagsHTML += `<div class="source-note">Source: ${ev.source_dataset === "manual" ? "Curated from scholarly sources" : ev.source_dataset}</div>`;

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
    if (cas == null || cas <= 0) return 6;
    return Math.min(6 + Math.log10(cas) * 3, 32);
  }

  /* ── Filter logic ─────────────────────────────────────────────── */
  let mapReady = false;
  function applyFilters() {
    if (!mapReady) return;
    const filtered = allEvents.filter((ev) => {
      if (ev.end_date < rangeStart || ev.start_date > rangeEnd) return false;
      if (!activeTypes.has(ev.conflict_type)) return false;
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

    // Heatmap layer — always visible, fades at high zoom
    map.addLayer({
      id: "conflicts-heat",
      type: "heatmap",
      source: "conflicts",
      maxzoom: 9,
      paint: {
        "heatmap-weight": [
          "interpolate", ["linear"],
          ["coalesce", ["get", "cas_high"], 5000],
          0, 0.15,
          1000, 0.3,
          10000, 0.5,
          100000, 0.8,
          1000000, 1,
        ],
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          1, 0.8,
          3, 1.0,
          5, 1.4,
          8, 1.8,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0,    "rgba(0, 0, 0, 0)",
          0.1,  "rgba(89, 40, 90, 0.35)",
          0.25, "rgba(158, 40, 80, 0.5)",
          0.4,  "rgba(213, 60, 70, 0.6)",
          0.6,  "rgba(240, 120, 50, 0.7)",
          0.8,  "rgba(255, 180, 50, 0.85)",
          1,    "rgba(255, 255, 180, 0.95)",
        ],
        "heatmap-radius": [
          "interpolate", ["linear"], ["zoom"],
          1, 20,
          3, 30,
          5, 45,
          7, 60,
          9, 80,
        ],
        "heatmap-opacity": [
          "interpolate", ["linear"], ["zoom"],
          6, 0.85,
          9, 0,
        ],
      },
    });

    // Circle layer — visible from zoom 2, fully opaque by zoom 4
    map.addLayer({
      id: "conflicts-circle",
      type: "circle",
      source: "conflicts",
      minzoom: 2,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2, ["*", ["get", "radius"], 0.6],
          4, ["*", ["get", "radius"], 0.8],
          8, ["*", ["get", "radius"], 1.2],
          12, ["*", ["get", "radius"], 1.8],
        ],
        "circle-color": ["get", "colour"],
        "circle-opacity": [
          "interpolate", ["linear"], ["zoom"],
          2, 0.6,
          4, 0.8,
          8, 0.9,
        ],
        "circle-stroke-width": [
          "interpolate", ["linear"], ["zoom"],
          2, 0.5,
          6, 1,
          10, 1.5,
        ],
        "circle-stroke-color": "rgba(255,255,255,0.35)",
        "circle-blur": 0.1,
      },
    });

    // Symbol layer for labels at higher zoom
    map.addLayer({
      id: "conflicts-label",
      type: "symbol",
      source: "conflicts",
      minzoom: 5,
      layout: {
        "text-field": ["get", "name"],
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          5, 9,
          8, 11,
          12, 13,
        ],
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
          5, 0,
          6, 1,
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
        .setHTML(`<strong>${f.properties.name}</strong><br><span style="color:${f.properties.colour}">${f.properties.type}</span> · ${cas} est. casualties`)
        .addTo(map);
    });
    map.on("mouseleave", "conflicts-circle", () => popup.remove());

    mapReady = true;
    applyFilters();
  }

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
        rangeStart = Math.max(MIN_YEAR, rangeStart - step);
        rangeEnd = Math.max(MIN_YEAR + 10, rangeEnd - step);
        updateSliderUI();
        clearEraActive();
        applyFilters();
        break;
      case "ArrowRight":
        e.preventDefault();
        rangeStart = Math.min(MAX_YEAR - 10, rangeStart + step);
        rangeEnd = Math.min(MAX_YEAR, rangeEnd + step);
        updateSliderUI();
        clearEraActive();
        applyFilters();
        break;
      case " ":
        e.preventDefault();
        togglePlay();
        break;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $detailPanel.classList.add("hidden");
      document.getElementById("era-presets").style.display = "";
    }
  });

  /* ── Info panel ────────────────────────────────────────────────── */
  document.getElementById("info-btn").addEventListener("click", () => {
    document.getElementById("info-panel").classList.toggle("hidden");
  });
  document.getElementById("info-close").addEventListener("click", () => {
    document.getElementById("info-panel").classList.add("hidden");
  });

  /* ── Boot ─────────────────────────────────────────────────────── */
  initSlider();
  buildTypeFilters();
  map.on("load", loadData);
})();
