import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

await import("./build-userscript.mjs");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  await readFile(path.join(repoRoot, "userscript-src/config.json"), "utf8"),
);
const bundlePath = path.join(repoRoot, "public/userscript/radarthing.bundle.js");
const outputPath = path.join(repoRoot, "radarthing.dev.user.js");
const productionApi = 'const ACARS_API = "https://radarthing.com/api/userscript/acars";';
const developmentApi = 'const ACARS_API = "http://localhost:3000/api/userscript/acars";';
const bundle = await readFile(bundlePath, "utf8");

if (bundle.split(productionApi).length !== 2) {
  throw new Error("Expected exactly one ACARS API URL in the userscript bundle");
}

const header = `// ==UserScript==
// @name         RadarThing Dev (local ACARS)
// @namespace    https://radarthing.com/
// @version      ${config.version}-dev
// @description  Self-contained RadarThing branch build with ACARS pointed at localhost:3000
// @author       xyzmani
// @match        http://*/geofs.php*
// @match        https://*/geofs.php*
// @grant        none
// ==/UserScript==

`;

await writeFile(outputPath, header + bundle.replace(productionApi, developmentApi));
console.log(`Built ${outputPath}`);
