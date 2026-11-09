import { readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { scenarios } from "../src/engine/config";
import { ENGINE_VERSION } from "../src/engine/simulation";
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const engineFiles = (await readdir("src/engine"))
  .filter((n) => n.endsWith(".ts"))
  .sort();
const source = await Promise.all(
  engineFiles.map(async (n) => [n, hash(await readFile(`src/engine/${n}`))]),
);
const artifacts = [];
for (const name of [
  ...Object.keys(scenarios()),
  "reference-run",
  "paired-smoke",
  "refinement",
]) {
  const original = await readFile(`results/${name}.json`),
    compressed = gzipSync(original, { level: 9 });
  if (!gunzipSync(compressed).equals(original))
    throw new Error(`Archive round-trip failed: ${name}`);
  await writeFile(`results/${name}.json.gz`, compressed);
  artifacts.push({
    file: `${name}.json.gz`,
    jsonSha256: hash(original),
    archiveSha256: hash(compressed),
    uncompressedBytes: original.length,
    compressedBytes: compressed.length,
  });
}
await writeFile(
  "results/manifest.json",
  JSON.stringify(
    {
      engineVersion: ENGINE_VERSION,
      node: process.version,
      sourceFiles: Object.fromEntries(source),
      sourceFingerprint: hash(JSON.stringify(source)),
      artifacts,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Archived and byte-verified ${artifacts.length} result files; ${Math.round(artifacts.reduce((n, a) => n + a.compressedBytes, 0) / 1024)} KiB compressed.`,
);
