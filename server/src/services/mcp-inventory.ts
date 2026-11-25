import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMcpToolInventory } from "@paperclipai/db";

export type McpToolInventory = Record<string, string[]>;

function normalizeTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tool = entry.trim();
    if (tool && !out.includes(tool)) out.push(tool);
  }
  return out;
}

/**
 * Reads the company-level MCP tool inventory cache. This is the source that
 * makes `requires.tools` enforceable: without an entry for a provider the
 * preflight can only warn (unknown inventory).
 */
export async function getCompanyToolInventory(db: Db, companyId: string): Promise<McpToolInventory> {
  const rows = await db
    .select({ serverName: companyMcpToolInventory.serverName, tools: companyMcpToolInventory.tools })
    .from(companyMcpToolInventory)
    .where(eq(companyMcpToolInventory.companyId, companyId));
  const inventory: McpToolInventory = {};
  for (const row of rows) {
    const tools = normalizeTools(row.tools);
    if (tools.length > 0) inventory[row.serverName] = tools;
  }
  return inventory;
}

/**
 * Upserts one provider's tool list. `source` records how it was obtained
 * ("tools_list", "manual", ...) for auditability.
 */
export async function upsertCompanyToolInventory(
  db: Db,
  input: {
    companyId: string;
    serverName: string;
    tools: unknown;
    source?: string;
  },
): Promise<{ serverName: string; tools: string[] }> {
  const serverName = input.serverName.trim();
  if (!serverName) throw new Error("serverName is required");
  const tools = normalizeTools(input.tools);
  const now = new Date();
  const existing = await db
    .select({ id: companyMcpToolInventory.id })
    .from(companyMcpToolInventory)
    .where(
      and(
        eq(companyMcpToolInventory.companyId, input.companyId),
        eq(companyMcpToolInventory.serverName, serverName),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (existing) {
    await db
      .update(companyMcpToolInventory)
      .set({ tools, source: input.source ?? "manual", lastSyncedAt: now, updatedAt: now })
      .where(eq(companyMcpToolInventory.id, existing.id));
  } else {
    await db.insert(companyMcpToolInventory).values({
      companyId: input.companyId,
      serverName,
      tools,
      source: input.source ?? "manual",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { serverName, tools };
}

export function readConfigToolInventory(config: Record<string, unknown>): McpToolInventory | null {
  const raw = config.mcpServerTools;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const inventory: McpToolInventory = {};
  for (const [server, tools] of Object.entries(raw as Record<string, unknown>)) {
    const list = normalizeTools(tools);
    if (list.length > 0) inventory[server] = list;
  }
  return Object.keys(inventory).length > 0 ? inventory : null;
}

export function mergeToolInventory(
  companyInventory: McpToolInventory,
  configInventory: McpToolInventory | null,
): McpToolInventory | null {
  const merged: McpToolInventory = { ...companyInventory };
  for (const [server, tools] of Object.entries(configInventory ?? {})) {
    merged[server] = tools;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}
