/**
 * Prints chunk SQL files for MCP execute_sql (one chunk index per argv).
 * Usage: node scripts/run-seed-chunks.mjs 0
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const index = Number(process.argv[2] ?? 0);
const file = path.join(__dirname, `chunk${String(index).padStart(2, "0")}.sql`);
if (!fs.existsSync(file)) {
  console.error("Missing", file);
  process.exit(1);
}
process.stdout.write(fs.readFileSync(file, "utf8"));
