import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "dist");

const apiOriginRaw = String(process.env.API_ORIGIN ?? "").trim().replace(/\/$/, "");

await fs.rm(OUT_DIR, { recursive: true, force: true });
await fs.mkdir(OUT_DIR, { recursive: true });
await fs.cp(PUBLIC_DIR, OUT_DIR, { recursive: true });

const indexPath = path.join(OUT_DIR, "index.html");
let indexHtml = await fs.readFile(indexPath, "utf8");
indexHtml = indexHtml.replaceAll("__API_ORIGIN__", apiOriginRaw);
await fs.writeFile(indexPath, indexHtml, "utf8");

console.log(`Built static site in ${OUT_DIR} (API_ORIGIN=${apiOriginRaw || "same-origin"})`);
