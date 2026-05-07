import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUERIES_DIR = join(dirname(fileURLToPath(import.meta.url)), "queries");

const cache = new Map<string, string>();

function loadFile(relPath: string): string {
  const cached = cache.get(relPath);
  if (cached !== undefined) return cached;
  const content = readFileSync(join(QUERIES_DIR, relPath), "utf8");
  cache.set(relPath, content);
  return content;
}

// Replaces ${name} placeholders with values from `vars`. Values are inserted
// verbatim. Sanitization of dynamic values is the caller's responsibility
// (use `sanitize()` from text-helpers before passing user input).
export function renderQuery(relPath: string, vars: Record<string, string | number> = {}): string {
  let content = loadFile(relPath);
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll("${" + key + "}", String(value));
  }
  return content;
}
