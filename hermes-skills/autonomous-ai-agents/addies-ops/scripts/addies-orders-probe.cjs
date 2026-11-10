// addies-orders-probe.cjs — READ-ONLY direct probe of live ADDies Order data.
// Use when the addies MCP orders.list tool is code-broken (dual-mongoose buffering
// timeout / collection mismatch / createdAt mapping) but a report is still needed:
// prints collection census, paymentStatus + orderStatus census, "pending" counts,
// and the 3 most recent in-progress rows. ZERO writes — reads only, never mutate.
//
// Usage: node <skill>/addies-ops/scripts/addies-orders-probe.cjs
// Env:   ADDIES_BACKEND_ROOT (default D:/Dev/appZeno/ADDies/backend)
// Exit 0 + "DONE" = clean run; nonzero = probe error.
//
// Verified 2026-08-15 on DCO-22 (backend mongoose 7.8.7, Atlas cluster
// addies.nukkvam.mongodb.net). Pure node (NOT python-spawned node — that crashed
// 0xC0000142 on Windows). Script must live in a node-resolvable location for
// mongoose's own requires; requiring via absolute path works from anywhere.
"use strict";
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); // ISP resolver refuses Atlas SRV queries

const fs = require("node:fs");
const path = require("node:path");

const backendRoot = process.env.ADDIES_BACKEND_ROOT || "D:/Dev/appZeno/ADDies/backend";
const envPath = path.join(backendRoot, ".env");
const env = fs.readFileSync(envPath, "utf8");
const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m); // strip surrounding quotes
if (!m) {
  console.error("DATABASE_URL not found in " + envPath);
  process.exit(1);
}
const uri = m[1].trim();

const mongoose = require(path.join(backendRoot, "node_modules", "mongoose", "index.js"));
const mongooseVersion = require(
  path.join(backendRoot, "node_modules", "mongoose", "package.json")
).version;

async function main() {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 45000,
    connectTimeoutMS: 30000,
  });
  const db = mongoose.connection.db;
  const ping = await db.command({ ping: 1 });
  console.log("PING_OK:", JSON.stringify(ping));
  console.log("MONGOOSE_VERSION:", mongooseVersion);

  // Collection census — locate where the live data actually is (mismatch:
  // model maps to lowercase 'orders' = 0 docs; live data is in 'Order').
  const cols = await db.listCollections().toArray();
  const names = cols.map((c) => c.name).sort();
  console.log("COLLECTIONS:", names.join(", "));
  for (const n of names) {
    console.log("COUNT", n, "=", await db.collection(n).countDocuments({}));
  }

  const Order = db.collection("Order");

  // Shape check: live docs store createdAt TOP-LEVEL (MCP toOrderDoc reads
  // timestamps?.createdAt -> would return null for every row).
  const sample = await Order.findOne({});
  if (sample) {
    console.log("SAMPLE_KEYS:", Object.keys(sample).join(","));
    console.log(
      "SAMPLE_TS:",
      JSON.stringify({
        createdAt: sample.createdAt,
        updatedAt: sample.updatedAt,
        timestamps: sample.timestamps,
      })
    );
  }

  const payCounts = await Order.aggregate([
    { $group: { _id: "$paymentStatus", n: { $sum: 1 } } },
  ]).toArray();
  console.log("PAYMENT_STATUS_CENSUS:", JSON.stringify(payCounts));

  const statusCounts = await Order.aggregate([
    { $group: { _id: "$orderStatus", n: { $sum: 1 } } },
  ]).toArray();
  console.log("ORDER_STATUS_CENSUS:", JSON.stringify(statusCounts));

  // The "pending" question: no pending orderStatus exists; only paymentStatus has it.
  console.log(
    "PENDING_TOTAL (paymentStatus=pending):",
    await Order.countDocuments({ paymentStatus: "pending" })
  );
  console.log(
    "ORDERSTATUS_PENDING_TOTAL:",
    await Order.countDocuments({ orderStatus: "pending" })
  );

  // Closest legitimate reading of "pending": in-progress (not delivered/cancelled).
  const totalInProgress = await Order.countDocuments({
    orderStatus: { $nin: ["delivered", "cancelled"] },
  });
  console.log("IN_PROGRESS_TOTAL:", totalInProgress);

  const recent = await Order.find({
    orderStatus: { $nin: ["delivered", "cancelled"] },
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();
  for (const r of recent) {
    console.log(
      "IN_PROGRESS_ROW:",
      JSON.stringify({
        id: String(r._id),
        orderId: r.orderId,
        grandTotal: r.grandTotal,
        orderStatus: r.orderStatus,
        paymentStatus: r.paymentStatus,
        createdAt: r.createdAt,
      })
    );
  }

  await mongoose.disconnect();
  console.log("DONE");
}

main().catch((e) => {
  console.error("PROBE_ERROR:", e.message);
  process.exit(1);
});
