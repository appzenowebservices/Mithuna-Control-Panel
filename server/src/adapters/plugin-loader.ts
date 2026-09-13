/**
 * External adapter plugin loader.
 *
 * Loads external adapter packages from the adapter-plugin-store and returns
 * their ServerAdapterModule instances. The caller (registry.ts) is
 * responsible for registering them.
 *
 * This avoids circular initialization: plugin-loader imports only
 * adapter-utils, never registry.ts.
 */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ServerAdapterModule } from "./types.js";
import { logger } from "../middleware/logger.js";

import {
  listAdapterPlugins,
  getAdapterPluginsDir,
  getAdapterPluginByType,
  addAdapterPlugin,
} from "../services/adapter-plugin-store.js";
import type { AdapterPluginRecord } from "../services/adapter-plugin-store.js";

(async () => {
  const tsxLoaderPath = path.resolve(new URL(import.meta.url).pathname, "../../../cli/node_modules/tsx/dist/esm/loader.mjs");
  if (fs.existsSync(tsxLoaderPath)) {
    await import(tsxLoaderPath);
  }
})();

// ---------------------------------------------------------------------------
// Local hermes-agent auto-registration
// ---------------------------------------------------------------------------

/**
 * Path to a local hermes-agent repository. When set, the hermes_http
 * adapter will be auto-registered from this path instead of npm.
 *
 * Can be set via:
 * - Environment variable: PAPERCLIP_HERMES_LOCAL_PATH
 * - Default locations: ~/workspace/hermes-agent, ../hermes-agent relative to paperclip
 */
function getLocalHermesAgentPath(): string | null {
  if (process.env.PAPERCLIP_HERMES_LOCAL_PATH) {
    return process.env.PAPERCLIP_HERMES_LOCAL_PATH;
  }

  const paperclipRoot = path.resolve(path.dirname(fileURLToPath(new URL(import.meta.url))), "../../..");
  const defaultLocations = [
    path.resolve(os.homedir(), "workspace", "hermes-agent"),
    path.resolve(paperclipRoot, "..", "hermes-agent"),
    path.resolve(paperclipRoot, "hermes-agent"),
  ];

  for (const loc of defaultLocations) {
    if (fs.existsSync(path.join(loc, "package.json"))) {
      return loc;
    }
  }
  return null;
}

/**
 * Auto-register hermes_http adapter from the local hermes-agent path.
 * Uses the local packages/adapters/hermes-http package which connects
 * via HTTP to a running hermes-agent server.
 *
 * Returns an object with:
 * - adapterModule: the loaded adapter (if successful)
 * - disabled: true if the adapter was registered but marked as unavailable
 */
async function autoRegisterLocalHermesAdapter(): Promise<{ adapterModule: ServerAdapterModule | null; disabled: boolean }> {
  const localPath = getLocalHermesAgentPath();

  const existingRecord = getAdapterPluginByType("hermes_http");
  const paperclipRoot = path.resolve(path.dirname(fileURLToPath(new URL(import.meta.url))), "../../..");
  const localAdapterPath = path.join(paperclipRoot, "packages", "adapters", "hermes-http");

  // Check if the hermes-http adapter package exists
  if (!fs.existsSync(path.join(localAdapterPath, "package.json"))) {
    logger.debug({ localPath, localAdapterPath }, "Local hermes-http adapter not found in paperclip");
    return { adapterModule: null, disabled: false };
  }

  // If no hermes-agent path found, register as disabled
  if (!localPath) {
    logger.info("No local hermes-agent path found — hermes_http adapter registered as disabled");
    const record: AdapterPluginRecord = {
      type: "hermes_http",
      packageName: "@paperclipai/adapter-hermes-http",
      localPath: localAdapterPath,
      installedAt: new Date().toISOString(),
      disabled: true,
    };
    addAdapterPlugin(record);
    // Still try to load the adapter so it appears in the registry
    try {
      const adapterModule = await loadExternalAdapterPackage("@paperclipai/adapter-hermes-http", localAdapterPath);
      return { adapterModule, disabled: true };
    } catch (err) {
      logger.warn({ err }, "Failed to load hermes_http adapter (disabled state)");
      return { adapterModule: null, disabled: true };
    }
  }

  // hermes-agent path found - check if it's already registered with same path
  if (existingRecord?.localPath === localPath) {
    logger.debug({ localPath }, "hermes_http already registered with this local path");
    try {
      const adapterModule = await loadExternalAdapterPackage("@paperclipai/adapter-hermes-http", localAdapterPath);
      return { adapterModule, disabled: false };
    } catch (err) {
      logger.warn({ err }, "Failed to reload hermes_http adapter");
      return { adapterModule: null, disabled: false };
    }
  }

  // Set the environment variable for the HTTP endpoint
  process.env.HERMES_HTTP_ENDPOINT = process.env.HERMES_HTTP_ENDPOINT ?? "http://localhost:8765/api/v1";

  const record: AdapterPluginRecord = {
    type: "hermes_http",
    packageName: "@paperclipai/adapter-hermes-http",
    localPath: localAdapterPath,
    installedAt: new Date().toISOString(),
  };

  addAdapterPlugin(record);
  logger.info({ localPath, localAdapterPath }, "Auto-registered hermes_http adapter from local hermes-agent path");

  try {
    const adapterModule = await loadExternalAdapterPackage("@paperclipai/adapter-hermes-http", localAdapterPath);
    return { adapterModule, disabled: false };
  } catch (err) {
    logger.warn({ err }, "Failed to load hermes_http adapter");
    return { adapterModule: null, disabled: false };
  }
}

// ---------------------------------------------------------------------------
// In-memory UI parser cache
// ---------------------------------------------------------------------------

const uiParserCache = new Map<string, string>();

export function getUiParserSource(adapterType: string): string | undefined {
  return uiParserCache.get(adapterType);
}

/**
 * On cache miss, attempt on-demand extraction from the plugin store.
 * Makes the ui-parser.js endpoint self-healing.
 */
export function getOrExtractUiParserSource(adapterType: string): string | undefined {
  const cached = uiParserCache.get(adapterType);
  if (cached) return cached;

  const record = getAdapterPluginByType(adapterType);
  if (!record) return undefined;

  const packageDir = resolvePackageDir(record);
  const source = extractUiParserSource(packageDir, record.packageName);
  if (source) {
    uiParserCache.set(adapterType, source);
    logger.info(
      { type: adapterType, packageName: record.packageName, origin: "lazy" },
      "UI parser extracted on-demand (cache miss)",
    );
  }
  return source;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolvePackageDir(record: Pick<AdapterPluginRecord, "localPath" | "packageName">): string {
  return record.localPath
    ? path.resolve(record.localPath)
    : path.resolve(getAdapterPluginsDir(), "node_modules", record.packageName);
}

function resolvePackageEntryPoint(packageDir: string): string {
  const pkgJsonPath = path.join(packageDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

  if (pkg.exports && typeof pkg.exports === "object" && pkg.exports["."]) {
    const exp = pkg.exports["."];
    return typeof exp === "string" ? exp : (exp.import ?? exp.default ?? "index.js");
  }
  return pkg.main ?? "index.js";
}

// ---------------------------------------------------------------------------
// UI parser extraction
// ---------------------------------------------------------------------------

const SUPPORTED_PARSER_CONTRACT = "1";

function extractUiParserSource(
  packageDir: string,
  packageName: string,
): string | undefined {
  const pkgJsonPath = path.join(packageDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

  if (!pkg.exports || typeof pkg.exports !== "object" || !pkg.exports["./ui-parser"]) {
    return undefined;
  }

  const contractVersion = pkg.paperclip?.adapterUiParser;
  if (contractVersion) {
    const major = contractVersion.split(".")[0];
    if (major !== SUPPORTED_PARSER_CONTRACT) {
      logger.warn(
        { packageName, contractVersion, supported: `${SUPPORTED_PARSER_CONTRACT}.x` },
        "Adapter declares unsupported UI parser contract version — skipping UI parser",
      );
      return undefined;
    }
  } else {
    logger.info(
      { packageName },
      "Adapter has ./ui-parser export but no paperclip.adapterUiParser version — loading anyway (future versions may require it)",
    );
  }

  const uiParserExp = pkg.exports["./ui-parser"];
  const uiParserFile = typeof uiParserExp === "string"
    ? uiParserExp
    : (uiParserExp.import ?? uiParserExp.default);
  const uiParserPath = path.resolve(packageDir, uiParserFile);

  if (!uiParserPath.startsWith(packageDir + path.sep) && uiParserPath !== packageDir) {
    logger.warn(
      { packageName, uiParserFile },
      "UI parser path escapes package directory — skipping",
    );
    return undefined;
  }

  if (!fs.existsSync(uiParserPath)) {
    return undefined;
  }

  try {
    const source = fs.readFileSync(uiParserPath, "utf-8");
    logger.info(
      { packageName, uiParserFile, size: source.length },
      `Loaded UI parser from adapter package${contractVersion ? "" : " (no version declared)"}`,
    );
    return source;
  } catch (err) {
    logger.warn({ err, packageName, uiParserFile }, "Failed to read UI parser from adapter package");
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Load / reload
// ---------------------------------------------------------------------------

function validateAdapterModule(mod: unknown, packageName: string): ServerAdapterModule {
  const m = mod as Record<string, unknown>;
  const createServerAdapter = m.createServerAdapter;
  if (typeof createServerAdapter !== "function") {
    throw new Error(
      `Package "${packageName}" does not export createServerAdapter(). ` +
      `Ensure the package's main entry exports a createServerAdapter function.`,
    );
  }

  const adapterModule = createServerAdapter() as ServerAdapterModule;
  if (!adapterModule || !adapterModule.type) {
    throw new Error(
      `createServerAdapter() from "${packageName}" returned an invalid module (missing "type").`,
    );
  }
  return adapterModule;
}

export async function loadExternalAdapterPackage(
  packageName: string,
  localPath?: string,
): Promise<ServerAdapterModule> {
  const packageDir = localPath
    ? path.resolve(localPath)
    : path.resolve(getAdapterPluginsDir(), "node_modules", packageName);

  const entryPoint = resolvePackageEntryPoint(packageDir);
  const modulePath = path.resolve(packageDir, entryPoint);
  const uiParserSource = extractUiParserSource(packageDir, packageName);

  logger.info({ packageName, packageDir, entryPoint, modulePath, hasUiParser: !!uiParserSource }, "Loading external adapter package");

  const mod = await import(pathToFileURL(modulePath).href);
  const adapterModule = validateAdapterModule(mod, packageName);

  if (uiParserSource) {
    uiParserCache.set(adapterModule.type, uiParserSource);
  }

  return adapterModule;
}

async function loadFromRecord(record: AdapterPluginRecord): Promise<ServerAdapterModule | null> {
  try {
    return await loadExternalAdapterPackage(record.packageName, record.localPath);
  } catch (err) {
    logger.warn(
      { err, packageName: record.packageName, type: record.type },
      "Failed to dynamically load external adapter; skipping",
    );
    return null;
  }
}

/**
 * Reload an external adapter at runtime (dev iteration without server restart).
 * Busts the ESM module cache via a cache-busting query string.
 */
export async function reloadExternalAdapter(
  type: string,
): Promise<ServerAdapterModule | null> {
  const record = getAdapterPluginByType(type);
  if (!record) return null;

  const packageDir = resolvePackageDir(record);
  const entryPoint = resolvePackageEntryPoint(packageDir);
  const modulePath = path.resolve(packageDir, entryPoint);
  const fileUrl = pathToFileURL(modulePath).href;

  // Bust ESM module cache so re-import loads fresh code from disk.
  // Query-string trick (?t=...) works in Node; Bun may need the file:// URL
  // to be evicted from its internal registry first.
  try {
    // @ts-expect-error -- Bun internal module cache
    const bunCache = globalThis.Bun?.__moduleCache as Map<string, unknown> | undefined;
    if (bunCache) {
      bunCache.delete(fileUrl);
      bunCache.delete(modulePath);
    }
  } catch {
    // Ignore — query-string fallback still works in Node
  }

  const cacheBustUrl = `${fileUrl}?t=${Date.now()}`;

  logger.info(
    { type, packageName: record.packageName, modulePath, cacheBustUrl },
    "Reloading external adapter (cache bust)",
  );

  const mod = await import(cacheBustUrl);
  const adapterModule = validateAdapterModule(mod, record.packageName);

  uiParserCache.delete(type);
  const uiParserSource = extractUiParserSource(packageDir, record.packageName);
  if (uiParserSource) {
    uiParserCache.set(adapterModule.type, uiParserSource);
  }

  logger.info(
    { type, packageName: record.packageName, hasUiParser: !!uiParserSource },
    "Successfully reloaded external adapter",
  );

  return adapterModule;
}

/**
 * Build all external adapter modules from the plugin store.
 */
export async function buildExternalAdapters(): Promise<ServerAdapterModule[]> {
  const results: ServerAdapterModule[] = [];

  // Auto-register local hermes-agent if available
  const { adapterModule: hermesModule } = await autoRegisterLocalHermesAdapter();
  if (hermesModule) {
    results.push(hermesModule);
  }

  const storeRecords = listAdapterPlugins();
  for (const record of storeRecords) {
    // Skip hermes_http if it was already processed above
    if (record.type === "hermes_http") continue;
    // Skip legacy mithuna_local records — the adapter is now hermes_http
    if (record.type === "mithuna_local") continue;
    const adapter = await loadFromRecord(record);
    if (adapter) {
      results.push(adapter);
    }
  }

  if (results.length > 0) {
    logger.info(
      { count: results.length, adapters: results.map((a) => a.type) },
      "Loaded external adapters from plugin store",
    );
  }

  return results;
}
