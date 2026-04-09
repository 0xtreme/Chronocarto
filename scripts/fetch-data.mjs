/**
 * fetch-data.mjs
 * Downloads the UCDP GED dataset (geocoded events, 1989–present).
 * Saves raw CSV to data/raw/ for later processing by build-dataset.mjs.
 *
 * Usage: node scripts/fetch-data.mjs
 *
 * Note: UCDP GED is ~60 MB compressed. The API provides JSON paginated access
 * for smaller queries. For full dataset, download the CSV from:
 *   https://ucdp.uu.se/downloads/index.html
 *
 * This script uses the UCDP API to fetch events page by page.
 */

import { writeFileSync, mkdirSync } from "fs";

const API_BASE = "https://ucdpapi.pcr.uu.se/api/gedevents/24.1";
const PAGE_SIZE = 1000;
const OUTPUT = "data/raw/ucdp-ged.json";

async function fetchPage(page) {
  const url = `${API_BASE}?pagesize=${PAGE_SIZE}&page=${page}`;
  console.log(`  Fetching page ${page}…`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for page ${page}`);
  return resp.json();
}

async function main() {
  mkdirSync("data/raw", { recursive: true });
  console.log("Fetching UCDP GED events from API…");

  let page = 0;
  let totalPages = 1;
  const allEvents = [];

  while (page < totalPages) {
    const data = await fetchPage(page);
    totalPages = data.TotalPages || 1;
    const results = data.Result || [];
    allEvents.push(...results);
    console.log(`  Got ${results.length} events (page ${page + 1}/${totalPages}, total so far: ${allEvents.length})`);
    page++;
    // Be polite to the API
    if (page < totalPages) await new Promise((r) => setTimeout(r, 500));
  }

  writeFileSync(OUTPUT, JSON.stringify(allEvents, null, 2));
  console.log(`✓ Saved ${allEvents.length} UCDP events → ${OUTPUT}`);
}

main().catch((err) => {
  console.error("Failed to fetch UCDP data:", err.message);
  console.log("You can manually download from https://ucdp.uu.se/downloads/index.html");
  process.exit(1);
});
