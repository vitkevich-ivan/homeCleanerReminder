import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const webRoot = resolve(root, "web");
const html = readFileSync(resolve(webRoot, "index.html"), "utf8");
const app = readFileSync(resolve(webRoot, "app.js"), "utf8");
const cloud = readFileSync(resolve(webRoot, "cloud.js"), "utf8");
const worker = readFileSync(resolve(webRoot, "sw.js"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(webRoot, "manifest.webmanifest"), "utf8"));

const ids = [...app.matchAll(/querySelector\("#([A-Za-z][\w-]*)"\)/g)].map((match) => match[1]);
const missingIds = ids.filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
assert(!missingIds.length, `HTML elements missing: ${missingIds.join(", ")}`);

for (const icon of manifest.icons || []) {
  assert(existsSync(resolve(webRoot, icon.src)), `Manifest file missing: ${icon.src}`);
}

const shellMatch = worker.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert(shellMatch, "Service worker APP_SHELL is missing");
for (const match of shellMatch[1].matchAll(/["']\.\/([^"']+)["']/g)) {
  assert(existsSync(resolve(webRoot, match[1])), `Cached file missing: ${match[1]}`);
}

assert(!/service[_-]?role/i.test(`${app}\n${cloud}`), "A service-role secret reference reached client code");
assert(!cloud.includes("localhost"), "Production authentication redirects to localhost");

console.log(`Web integrity check passed: ${ids.length} UI bindings, ${(manifest.icons || []).length} icons.`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
