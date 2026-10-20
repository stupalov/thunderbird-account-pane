#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDirectory = path.join(repoRoot, "addon", "icons");
const svg = await readFile(path.join(iconDirectory, "accountpane.svg"));

for (const size of [16, 32, 48, 64, 128]) {
  await sharp(svg)
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(path.join(iconDirectory, `accountpane-${size}.png`));
}
