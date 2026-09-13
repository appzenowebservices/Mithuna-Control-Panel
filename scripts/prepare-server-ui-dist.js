import { cpSync, existsSync, rmSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "dirname");

const REPO_ROOT = resolve(__dirname, "..", "..");
const UI_DIST = join(REPO_ROOT, "ui", "dist");
const SERVER_UI_DIST = join(REPO_ROOT, "server", "ui-dist");

const shouldReuse = process.env.PAPERCLIP_RELEASE_REUSE_UI_DIST === "1" || 
                    process.env.PAPERCLIP_RELEASE_REUSE_UI_DIST === "true";

if (shouldReuse && existsSync(join(UI_DIST, "index.html"))) {
  console.log("  -> Reusing existing @paperclipai/ui dist output");
} else {
  console.log("  -> Building @paperclipai/ui...");
  // UI build is handled separately
}

if (!existsSync(join(UI_DIST, "index.html"))) {
  console.error(`Error: UI build output missing at ${UI_DIST}/index.html`);
  process.exit(1);
}

if (existsSync(SERVER_UI_DIST)) {
  rmSync(SERVER_UI_DIST, { recursive: true, force: true });
}
cpSync(UI_DIST, SERVER_UI_DIST, { recursive: true });
console.log("  -> Copied ui/dist to server/ui-dist");