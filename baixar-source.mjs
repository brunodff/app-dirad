import fs from "fs/promises";
import path from "path";

/**
 * Uso:
 *   node baixar-source.mjs <deploymentId> <vercelToken>
 * Ex:
 *   node baixar-source.mjs dpl_3M9fGyq9W... vlt_neRj9ZKO1X80f4idSt0ScdQZ
 */

const [,, DEPLOY_ID, VERCEL_TOKEN] = process.argv;

if (!DEPLOY_ID || !VERCEL_TOKEN) {
  console.error("\nUso: node baixar-source.mjs <deploymentId> <vercelToken>\n");
  process.exit(1);
}

const base = `https://api.vercel.com/v6/deployments/${DEPLOY_ID}`;
const outDir = path.resolve("./app-dirad-recuperado");

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} -> ${url}`);
  return res.json();
}

async function getBuffer(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} -> ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  console.log(`\nBaixando arquivos do deploy: ${DEPLOY_ID}`);
  await fs.mkdir(outDir, { recursive: true });

  console.log("Listando arquivos...");
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

  console.log(`\nConcluído: ${ok} arquivos salvos em ${outDir}\n`);
})();
