import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { reference } from "../src/engine/config";
import type { Config } from "../src/engine/types";
export const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((a, v, i, all) => {
    if (v.startsWith("--")) a.push([v.slice(2), all[i + 1]]);
    return a;
  }, []),
);
export async function config(): Promise<Config> {
  return args.config
    ? JSON.parse(await readFile(args.config, "utf8"))
    : reference();
}
export async function save(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
export function integer(name: string, fallback: number) {
  const n = Number(args[name] ?? fallback);
  if (!Number.isSafeInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}
