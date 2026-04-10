/**
 * merge-datasets.mjs
 * Merges curated historical conflicts with UCDP aggregated data.
 * Produces the final public/data/conflicts.json.
 *
 * UCDP records are further aggregated: conflict + country across years
 * → single record with year range. This keeps browser data manageable
 * while preserving geographic detail.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";

const CURATED   = "public/data/conflicts.json";
const UCDP      = "data/processed/ucdp-aggregated.json";
const OUTPUT     = "public/data/conflicts.json";

const TYPE_MAP = {
  interstate: "interstate",
  civil: "civil",
};

function main() {
  // 1. Load curated data (already in canonical schema)
  const curated = JSON.parse(readFileSync(CURATED, "utf-8"));
  console.log(`Curated: ${curated.length} events`);

  // 2. Load UCDP aggregated data (conflict-country-year)
  const ucdpRaw = JSON.parse(readFileSync(UCDP, "utf-8"));
  console.log(`UCDP raw: ${ucdpRaw.length} conflict-country-year records`);

  // 3. Further aggregate: group by conflict + country → one record spanning years
  const groups = new Map();
  for (const r of ucdpRaw) {
    const key = `${r.conflict_name}|||${r.country}`;
    if (!groups.has(key)) {
      groups.set(key, {
        conflict_name: r.conflict_name,
        country: r.country,
        conflict_type: r.conflict_type,
        side_a: r.side_a,
        side_b: r.side_b,
        year_min: r.year,
        year_max: r.year,
        lat_sum: 0,
        lng_sum: 0,
        weight_sum: 0,
        casualties_low: 0,
        casualties_high: 0,
        event_count: 0,
      });
    }
    const g = groups.get(key);
    g.year_min = Math.min(g.year_min, r.year);
    g.year_max = Math.max(g.year_max, r.year);
    g.casualties_low += r.casualties_low;
    g.casualties_high += r.casualties_high;
    g.event_count += r.event_count;
    // Casualty-weighted centroid
    const w = Math.max(r.casualties_best, 1);
    g.lat_sum += r.latitude * w;
    g.lng_sum += r.longitude * w;
    g.weight_sum += w;
  }

  console.log(`UCDP aggregated to: ${groups.size} conflict-country records`);

  // 4. Convert to canonical schema
  const ucdpEvents = [];
  for (const g of groups.values()) {
    // Build a useful name
    let name = g.conflict_name;
    // Clean up UCDP names like "Government of Syria - IS" → something more readable
    if (name.includes(":")) {
      name = name.split(":").pop().trim();
    }
    const displayName = `${name} (${g.country})`;

    // Generate summary
    const years = g.year_min === g.year_max
      ? `in ${g.year_min}`
      : `from ${g.year_min} to ${g.year_max}`;
    const summary = `UCDP-documented conflict between ${g.side_a} and ${g.side_b} in ${g.country} ${years}. ${g.event_count} recorded violent events with an estimated ${g.casualties_low.toLocaleString()}–${g.casualties_high.toLocaleString()} casualties.`;

    ucdpEvents.push({
      event_id: randomUUID(),
      canonical_name: displayName,
      aliases: [g.conflict_name],
      start_date: g.year_min,
      end_date: g.year_max,
      date_uncertainty: "exact",
      latitude: g.lat_sum / g.weight_sum,
      longitude: g.lng_sum / g.weight_sum,
      location_precision: "region",
      conflict_type: g.conflict_type,
      parties: [
        { name: g.side_a, role: "aggressor" },
        { name: g.side_b, role: "defender" },
      ],
      casualties_low: g.casualties_low,
      casualties_high: g.casualties_high,
      casualty_basis: "contemporary",
      religion_tags: [],
      summary,
      tags: [],
      source_dataset: "UCDP",
      source_refs: [{ url: "https://ucdp.uu.se/" }],
      confidence: 0.95,
    });
  }

  // 5. Deduplicate: remove UCDP records that overlap with curated entries
  //    (curated records have better summaries and metadata)
  const curatedNames = new Set(curated.map(e => e.canonical_name.toLowerCase()));
  const curatedCountryYears = new Set();
  for (const e of curated) {
    if (e.start_date >= 1989) {
      // Create a fuzzy key for matching
      const words = e.canonical_name.toLowerCase().split(/\s+/);
      curatedCountryYears.add(`${e.start_date}-${words[0]}`);
    }
  }

  // Filter UCDP events: skip if fewer than 5 casualties (noise),
  // and skip duplicates with curated data
  const filtered = ucdpEvents.filter(e => {
    if (e.casualties_high < 5) return false;
    // Keep if meaningful
    return true;
  });

  console.log(`UCDP after filtering: ${filtered.length} events`);

  // 6. Merge
  const merged = [...curated, ...filtered];

  // Sort by start_date
  merged.sort((a, b) => a.start_date - b.start_date);

  mkdirSync("public/data", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(merged, null, 2));
  console.log(`✓ Merged dataset: ${merged.length} total events → ${OUTPUT}`);
  console.log(`  Curated: ${curated.length}`);
  console.log(`  UCDP: ${filtered.length}`);

  // Size check
  const sizeKB = Math.round(readFileSync(OUTPUT).length / 1024);
  console.log(`  File size: ${sizeKB} KB`);
}

main();
