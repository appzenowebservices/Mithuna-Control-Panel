import { cpSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "dirname");

const sourceDir = resolve(__dirname, "src", "onboarding-assets");
const targetDir = resolve(__dirname, "dist", "onboarding-assets");

if (existsSync(sourceDir)) {
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
  console.log("  -> Copied onboarding-assets to dist/");
}