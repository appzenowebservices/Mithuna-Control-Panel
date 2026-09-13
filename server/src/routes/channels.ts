import { Router } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { logger } from "../middleware/logger.js";

// Known Hermes built-in platforms (mirrors hermes-agent/gateway/config.py:Platform enum)
// Plus plugin-discovered platforms are merged at runtime.
const BUILTIN_PLATFORMS: Array<{ name: string; label: string; emoji: string }> = [
  { name: "telegram", label: "Telegram", emoji: "✈️" },
  { name: "discord", label: "Discord", emoji: "💬" },
  { name: "slack", label: "Slack", emoji: "💼" },
  { name: "whatsapp", label: "WhatsApp", emoji: "📱" },
  { name: "whatsapp_cloud", label: "WhatsApp Cloud", emoji: "☁️" },
  { name: "signal", label: "Signal", emoji: "🔒" },
  { name: "mattermost", label: "Mattermost", emoji: "🌊" },
  { name: "matrix", label: "Matrix", emoji: "🧩" },
  { name: "email", label: "Email", emoji: "📧" },
  { name: "sms", label: "SMS", emoji: "💌" },
  { name: "dingtalk", label: "DingTalk", emoji: "🔔" },
  { name: "feishu", label: "Feishu", emoji: "🪶" },
  { name: "wecom", label: "WeCom", emoji: "🏢" },
  { name: "weixin", label: "Weixin", emoji: "💚" },
  { name: "bluebubbles", label: "BlueBubbles", emoji: "💙" },
  { name: "qqbot", label: "QQ Bot", emoji: "🐧" },
  { name: "yuanbao", label: "Yuanbao", emoji: "💎" },
  { name: "homeassistant", label: "Home Assistant", emoji: "🏠" },
  { name: "api_server", label: "API Server", emoji: "🔌" },
  { name: "webhook", label: "Webhook", emoji: "🪝" },
];

function getHermesHomeCandidates(): string[] {
  const candidates: string[] = [];
  const envHome = process.env.HERMES_HOME?.trim();
  if (envHome) candidates.push(envHome);
  // Dev checkout — allow reading from sibling hermes-agent if no global home
  const repoHermesHome = path.resolve(process.cwd(), "..", "hermes-agent");
  // Global homes
  const homeDir = os.homedir();
  candidates.push(path.join(homeDir, ".hermes"));
  // Also try repo sibling as .hermes home fallback for dev
  if (fs.existsSync(repoHermesHome)) {
    // not a hermes home itself, but contains channel_directory logic via gateway — still push for plugin scan
    candidates.push(repoHermesHome);
  }
  return candidates;
}

function readJsonFileSafe(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadDirectory(): { updatedAt: string | null; platforms: Record<string, unknown[]> } {
  for (const base of getHermesHomeCandidates()) {
    // channel_directory is at <HERMES_HOME>/channel_directory.json
    const candidate = path.join(base, "channel_directory.json");
    const data = readJsonFileSafe(candidate);
    if (data && typeof data === "object" && data !== null && "platforms" in (data as Record<string, unknown>)) {
      const d = data as { updated_at?: string; updatedAt?: string; platforms?: Record<string, unknown[]> };
      return {
        updatedAt: (d.updated_at ?? d.updatedAt ?? null) as string | null,
        platforms: (d.platforms ?? {}) as Record<string, unknown[]>,
      };
    }
    // Also try legacy location: <repo>/channel_directory.json handling not needed
  }
  return { updatedAt: null, platforms: {} };
}

function loadChannelAliases(): Record<string, Record<string, string>> {
  for (const base of getHermesHomeCandidates()) {
    const p = path.join(base, "channel_aliases.json");
    const data = readJsonFileSafe(p);
    if (data && typeof data === "object") return data as Record<string, Record<string, string>>;
  }
  return {};
}

function loadGatewayPlatformMeta(): Map<string, { enabled?: boolean; extra?: Record<string, unknown> }> {
  const meta = new Map<string, { enabled?: boolean; extra?: Record<string, unknown> }>();
  for (const base of getHermesHomeCandidates()) {
    const jsonPath = path.join(base, "gateway.json");
    const j = readJsonFileSafe(jsonPath) as { platforms?: Record<string, { enabled?: boolean; extra?: Record<string, unknown> }> } | null;
    if (j?.platforms) {
      for (const [k, v] of Object.entries(j.platforms)) meta.set(k.toLowerCase(), v);
    }
    const yamlPath = path.join(base, "config.yaml");
    if (fs.existsSync(yamlPath)) {
      try {
        const raw = fs.readFileSync(yamlPath, "utf-8");
        // lightweight regex scan: top-level "<platform>:" followed by indented "enabled: true/false"
        // avoids needing js-yaml dep; hermes yaml is simple
        const lines = raw.split(/\r?\n/);
        let curPlatform: string | null = null;
        let indentOfCur = 0;
        for (const line of lines) {
          const topMatch = line.match(/^([a-z_]+):\s*$/);
          if (topMatch) {
            const name = topMatch[1].toLowerCase();
            if (BUILTIN_PLATFORMS.some((p) => p.name === name) || name === "platforms" || name === "gateway") {
              curPlatform = name;
              indentOfCur = 0;
              continue;
            }
            curPlatform = null;
            continue;
          }
          if (curPlatform && curPlatform !== "platforms" && curPlatform !== "gateway") {
            const enabledMatch = line.match(/^\s{2}enabled\s*:\s*(true|false)\s*$/i);
            if (enabledMatch) {
              const enabled = enabledMatch[1].toLowerCase() === "true";
              const existing = meta.get(curPlatform) ?? {};
              existing.enabled = enabled;
              meta.set(curPlatform, existing);
            }
          }
          // nested platforms: "  telegram:" inside "platforms:" or "gateway:"
          const nestedMatch = line.match(/^\s{2}([a-z_]+):\s*$/);
          if (nestedMatch) {
            const name = nestedMatch[1].toLowerCase();
            // peek next lines for enabled inside this nested block — handled by deeper indent scan below
            // store as candidate for next enabled lines with 4-space indent
            // we keep curPlatform as nested name when previous cur was platforms/gateway
            if ((curPlatform === "platforms" || curPlatform === "gateway") && !meta.has(name)) {
              // look ahead 10 lines for enabled
              const idx = lines.indexOf(line);
              for (let i = idx + 1; i < Math.min(idx + 10, lines.length); i++) {
                const nxt = lines[i];
                if (/^\s{2}[a-z_]+:\s*$/.test(nxt)) break;
                const en = nxt.match(/^\s{4}enabled\s*:\s*(true|false)\s*$/i);
                if (en) {
                  const enabled = en[1].toLowerCase() === "true";
                  meta.set(name, { enabled });
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        logger.debug({ err: e }, "channels: yaml parse skipped");
      }
    }
  }
  return meta;
}

function discoverPluginPlatforms(): Array<{ name: string; label: string }> {
  const found: Array<{ name: string; label: string }> = [];
  const scanRoots: string[] = [];
  for (const base of getHermesHomeCandidates()) {
    scanRoots.push(path.join(base, "plugins", "platforms"));
    scanRoots.push(path.join(base, ".hermes", "plugins", "platforms"));
  }
  // repo sibling
  scanRoots.push(path.resolve(process.cwd(), "..", "hermes-agent", "plugins", "platforms"));
  scanRoots.push(path.resolve(process.cwd(), "..", "..", "hermes-agent", "plugins", "platforms"));

  const seen = new Set(BUILTIN_PLATFORMS.map((p) => p.name));
  for (const root of scanRoots) {
    try {
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const name = ent.name.toLowerCase();
        if (seen.has(name)) continue;
        const hasInit = fs.existsSync(path.join(root, ent.name, "__init__.py")) || fs.existsSync(path.join(root, ent.name, "plugin.yaml")) || fs.existsSync(path.join(root, ent.name, "plugin.yml"));
        if (!hasInit) continue;
        seen.add(name);
        found.push({ name, label: ent.name });
      }
    } catch {
      // ignore
    }
  }
  return found;
}

function buildPlatformsView(
  directory: { updatedAt: string | null; platforms: Record<string, unknown[]> },
  gatewayMeta: Map<string, { enabled?: boolean; extra?: Record<string, unknown> }>,
  pluginPlatforms: Array<{ name: string; label: string }>,
) {
  const allDefs = [
    ...BUILTIN_PLATFORMS.map((p) => ({ ...p, source: "builtin" as const })),
    ...pluginPlatforms.map((p) => ({ name: p.name, label: p.label, emoji: "🔌", source: "plugin" as const })),
  ];

  // Deduplicate by name, keep first
  const defMap = new Map<string, (typeof allDefs)[number]>();
  for (const d of allDefs) if (!defMap.has(d.name)) defMap.set(d.name, d);

  // Include any platforms that appear in directory but not in defs (dynamic)
  for (const name of Object.keys(directory.platforms)) {
    if (!defMap.has(name)) {
      defMap.set(name, { name, label: name, emoji: "🔌", source: "plugin" });
    }
  }
  // Also include gateway meta keys
  for (const name of gatewayMeta.keys()) {
    if (!defMap.has(name)) defMap.set(name, { name, label: name, emoji: "🔌", source: "plugin" });
  }

  const platforms = Array.from(defMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((def) => {
      const channelsRaw = directory.platforms[def.name] ?? [];
      const channels = Array.isArray(channelsRaw) ? channelsRaw : [];
      const meta = gatewayMeta.get(def.name);
      // Heuristic status: if enabled === false → disabled; else if channels present → connected-ish; else unknown
      let status: "connected" | "disabled" | "not_configured" | "unknown" = "unknown";
      if (meta?.enabled === false) status = "disabled";
      else if (channels.length > 0) status = "connected";
      else if (meta?.enabled === true) status = "not_configured";
      else if (channels.length === 0) status = "not_configured";

      return {
        name: def.name,
        label: def.label,
        emoji: def.emoji,
        source: def.source,
        enabled: meta?.enabled ?? null,
        channelCount: channels.length,
        status,
        channels: channels.slice(0, 200), // cap for read-only view
      };
    });

  return platforms;
}

export function channelRoutes(_db: Db) {
  const router = Router();

  // Per-company read-only dashboard — company-scoped for Paperclip isolation,
  // but data is global Hermes gateway directory (no per-company hermes homes yet).
  router.get("/companies/:companyId/channels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const directory = loadDirectory();
    const aliases = loadChannelAliases();
    const gatewayMeta = loadGatewayPlatformMeta();
    const pluginPlatforms = discoverPluginPlatforms();
    const platforms = buildPlatformsView(directory, gatewayMeta, pluginPlatforms);

    const totalChannels = platforms.reduce((acc, p) => acc + p.channelCount, 0);
    const connectedCount = platforms.filter((p) => p.status === "connected").length;

    res.json({
      companyId,
      updatedAt: directory.updatedAt,
      totalPlatforms: platforms.length,
      totalChannels,
      connectedPlatforms: connectedCount,
      aliasCount: Object.keys(aliases).length,
      platforms,
      // raw directory for power users (capped)
      directory: {
        updatedAt: directory.updatedAt,
        platforms: directory.platforms,
      },
    });
  });

  router.get("/companies/:companyId/channels/:platform", async (req, res) => {
    const companyId = req.params.companyId as string;
    const platform = (req.params.platform as string).toLowerCase();
    assertCompanyAccess(req, companyId);

    const directory = loadDirectory();
    const channelsRaw = directory.platforms[platform] ?? null;
    if (channelsRaw === null || channelsRaw === undefined) {
      res.status(404).json({ error: `Platform not found or no channels: ${platform}` });
      return;
    }
    const gatewayMeta = loadGatewayPlatformMeta();
    const pluginPlatforms = discoverPluginPlatforms();
    const platformsView = buildPlatformsView(directory, gatewayMeta, pluginPlatforms);
    const meta = platformsView.find((p) => p.name === platform) ?? null;
    res.json({
      companyId,
      platform,
      meta,
      updatedAt: directory.updatedAt,
      channels: Array.isArray(channelsRaw) ? channelsRaw : [],
    });
  });

  return router;
}
