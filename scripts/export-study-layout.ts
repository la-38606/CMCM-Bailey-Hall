import { readFile, writeFile } from "node:fs/promises";
import { buildGeometry, validateGeometry } from "../src/engine/geometry";
import type { Config } from "../src/engine/types";
import { args } from "./io";
const config: Config = JSON.parse(
  await readFile(args.config ?? "scenarios/study/dynamic-partial.json", "utf8"),
);
const geometry = buildGeometry(config);
const errors = validateGeometry(geometry, config);
if (errors.length) throw Error(errors.join("\n"));
const data = JSON.stringify({ config, geometry });
if (args.out) await writeFile(args.out, data + "\n");
else process.stdout.write(data + "\n");
