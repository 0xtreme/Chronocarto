/**
 * process-ucdp.mjs
 * Reads raw UCDP GED CSV (420k individual events) and aggregates into
 * conflict-country-year records suitable for browser rendering.
 *
 * Strategy: group events by (conflict_name, country, year), compute:
 *   - centroid lat/lng (weighted by casualties)
 *   - total casualties (low/best/high)
 *   - belligerents (side_a, side_b)
 *   - violence type → our conflict_type enum
 *
 * Output: data/processed/ucdp-aggregated.json
 */

import { createReadStream } from "fs";
import { writeFileSync, mkdirSync } from "fs";
import { parse } from "csv-parse";

const INPUT  = "data/raw/GEDEvent_v24_1.csv";
const OUTPUT = "data/processed/ucdp-aggregated.json";

// UCDP type_of_violence → our conflict_type
const VIOLENCE_MAP = {
  "1": "interstate",   // state-based: interstate
  "2": "civil",        // state-based: intrastate (civil)
  "3": "civil",        // state-based: internationalised intrastate
};

function run() {
  return new Promise((resolve, reject) => {
    const groups = new Map();
    let rowCount = 0;
    let skipped = 0;

    const parser = createReadStream(INPUT).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
      })
    );

    parser.on("data", (row) => {
      rowCount++;
      const lat = parseFloat(row.latitude);
      const lng = parseFloat(row.longitude);
      if (isNaN(lat) || isNaN(lng)) { skipped++; return; }

      const year = parseInt(row.year, 10);
      if (isNaN(year)) { skipped++; return; }

      const conflictName = (row.conflict_name || "").trim();
      const country = (row.country || "").trim();
      if (!conflictName) { skipped++; return; }

      const key = `${conflictName}|||${country}|||${year}`;
      const best = parseInt(row.best, 10) || 0;
      const high = parseInt(row.high, 10) || 0;
      const low  = parseInt(row.low, 10) || 0;

      if (!groups.has(key)) {
        groups.set(key, {
          conflict_name: conflictName,
          country,
          year,
          type_of_violence: row.type_of_violence,
          side_a: (row.side_a || "").trim(),
          side_b: (row.side_b || "").trim(),
          events: 0,
          best_total: 0,
          high_total: 0,
          low_total: 0,
          lat_sum: 0,
          lng_sum: 0,
          weight_sum: 0,
        });
      }

      const g = groups.get(key);
      g.events++;
      g.best_total += best;
      g.high_total += high;
      g.low_total += low;
      // Casualty-weighted centroid
      const w = Math.max(best, 1);
      g.lat_sum += lat * w;
      g.lng_sum += lng * w;
      g.weight_sum += w;
    });

    parser.on("end", () => {
      console.log(`  Parsed ${rowCount} rows, skipped ${skipped}, grouped into ${groups.size} records`);

      const results = [];
      for (const g of groups.values()) {
        results.push({
          conflict_name: g.conflict_name,
          country: g.country,
          year: g.year,
          conflict_type: VIOLENCE_MAP[g.type_of_violence] || "civil",
          side_a: g.side_a,
          side_b: g.side_b,
          latitude: g.lat_sum / g.weight_sum,
          longitude: g.lng_sum / g.weight_sum,
          casualties_low: g.low_total,
          casualties_best: g.best_total,
          casualties_high: g.high_total,
          event_count: g.events,
        });
      }

      resolve(results);
    });

    parser.on("error", reject);
  });
}

async function main() {
  mkdirSync("data/processed", { recursive: true });
  console.log("Processing UCDP GED data…");
  const records = await run();

  // Sort by year, then by casualties descending
  records.sort((a, b) => a.year - b.year || b.casualties_best - a.casualties_best);

  writeFileSync(OUTPUT, JSON.stringify(records, null, 2));
  console.log(`✓ Wrote ${records.length} aggregated records → ${OUTPUT}`);

  // Stats
  const years = [...new Set(records.map(r => r.year))].sort((a,b) => a - b);
  console.log(`  Year range: ${years[0]}–${years[years.length - 1]}`);
  console.log(`  Countries: ${new Set(records.map(r => r.country)).size}`);
  console.log(`  Total casualties (best): ${records.reduce((s, r) => s + r.casualties_best, 0).toLocaleString()}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
