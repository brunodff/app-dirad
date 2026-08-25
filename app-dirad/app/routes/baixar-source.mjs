// Uso: node baixar-source.mjs dpl_XXXXXXXX VERCEL_TOKEN_AQUI
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

const [ , , DEPLOY_ID, TOKEN ] = process.argv;
if (!DEPLOY_ID || !TOKEN) {
  console.error("Uso: node baixar-source.mjs <DEPLOY_ID> <VERCEL_TOKEN>");
  process.exit(1);
}

const base = `https://api.vercel.com/v13/deployments/${DEPLOY_ID}`;

async function getJSON(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} -> ${url}`);
  return r.json();
}
async function getBuffer(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} -> ${url}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

const outDir = path.resolve("./app-dirad-recuperado");
await fs.mkdir(outDir, { recursive: true });

console.log("Listando arquivos do deploy...");
const list = await getJSON(`${base}/files?all=1&limit=5000`);

let ok = 0;
for (const f of list) {
  if (f.type !== "file") continue;
  const dest = path.join(outDir, f.name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const buf = await getBuffer(`${base}/files/${encodeURIComponent(f.name)}`);
  await fs.writeFile(dest, buf);
  ok++;
  console.log("OK:", f.name);
}

console.log(`\nConcluído: ${ok} arquivos salvos em ${outDir}`);
