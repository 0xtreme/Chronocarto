/**
 * sync-pages-assets.mjs
 * Copies public/ → docs/ for GitHub Pages deployment.
 */

import { cpSync, mkdirSync, rmSync, existsSync } from "fs";

const SRC = "public";
const DEST = "docs";

// Clean destination (except docs/*.md design docs)
if (existsSync(DEST)) {
  // Remove only web assets, preserve markdown docs
  for (const item of ["index.html", "app.js", "styles.css", "favicon.svg", "data"]) {
    const target = `${DEST}/${item}`;
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
}

mkdirSync(DEST, { recursive: true });

// Copy all public assets
cpSync(SRC, DEST, { recursive: true });

console.log(`✓ Synced ${SRC}/ → ${DEST}/`);
