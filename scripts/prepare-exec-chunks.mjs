import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chunks = JSON.parse(fs.readFileSync(path.join(__dirname, "chunks-for-mcp.json"), "utf8"));

for (let i = 0; i < chunks.length; i++) {
  const out = path.join(__dirname, `exec-chunk-${i}.txt`);
  fs.writeFileSync(out, chunks[i], "utf8");
  console.log(`wrote ${out} (${chunks[i].length} bytes)`);
}
