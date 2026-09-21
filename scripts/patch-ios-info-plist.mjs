/**
 * Merge required iOS privacy usage strings into ios/App/App/Info.plist.
 *
 * The ios/ tree is generated on macOS (`npx cap add ios`) and is not in this
 * Windows checkout, so this script is a no-op when Info.plist is missing.
 * Run after every `cap sync` so Save Image / share → Photos never crashes
 * with TCC NSPhotoLibraryAddUsageDescription.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const plist = require("plist");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const infoPlistPath = join(root, "ios", "App", "App", "Info.plist");

/** Keys Apple aborts on when missing during Photos writes. */
const REQUIRED = {
  NSPhotoLibraryAddUsageDescription:
    "Narsil saves artwork extracts to your Photos library when you choose Save Image.",
};

if (!existsSync(infoPlistPath)) {
  console.log(
    `[patch-ios-info-plist] skip — ${infoPlistPath} not found (ios platform not generated here)`,
  );
  process.exit(0);
}

const parsed = plist.parse(readFileSync(infoPlistPath, "utf8"));
if (!parsed || typeof parsed !== "object") {
  console.error(`[patch-ios-info-plist] could not parse ${infoPlistPath}`);
  process.exit(1);
}

let changed = false;
for (const [key, value] of Object.entries(REQUIRED)) {
  if (parsed[key] === value) continue;
  if (parsed[key] && parsed[key] !== value) {
    console.log(`[patch-ios-info-plist] updating ${key}`);
  } else {
    console.log(`[patch-ios-info-plist] adding ${key}`);
  }
  parsed[key] = value;
  changed = true;
}

if (!changed) {
  console.log("[patch-ios-info-plist] Info.plist already has required keys");
  process.exit(0);
}

writeFileSync(infoPlistPath, plist.build(parsed) + "\n");
console.log(`[patch-ios-info-plist] wrote ${infoPlistPath}`);
