// Bootstrap for the ADDies MCP server: force public DNS before the server
// starts. The local router DNS (Reliance, IPv6) fails on MongoDB Atlas SRV
// lookups ("querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net"),
// while public resolvers resolve them fine. dns.setServers applies to
// Node's dns.resolve* family, which the mongodb driver uses for SRV.
import * as dns from "node:dns";

async function main() {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
  await import("file:///D:/Dev/appZeno/ADDies/mcp/src/index.ts");
}

main().catch((e) => {
  console.error("bootstrap failed:", e);
  process.exit(1);
});
