// Read-only ADDies orders probe — status distributions or top-N listing.
// Usage:
//   node probe-addies-orders.mjs                 # status distributions (orderStatus + paymentStatus)
//   node probe-addies-orders.mjs orderStatus created 3   # top-3 newest orders in a status
//   node probe-addies-orders.mjs paymentStatus pending 5 # top-5 by paymentStatus (use the field explicitly)
//
// NEVER writes anything. Loads DATABASE_URL from ADDies backend/.env (value is
// quoted — quotes stripped), pins public DNS (local ISP resolver fails Atlas
// SRV), resolves mongoose from the mcp dir's node_modules (temp-dir scripts
// can't resolve dotenv/mongoose from their own location).
import fs from "node:fs";
import dns from "node:dns";
import { createRequire } from "node:module";

dns.setServers(["8.8.8.8", "1.1.1.1"]);
const require = createRequire("D:/Dev/appZeno/ADDies/mcp/package.json");
const mongoose = require("mongoose");

const envPath = "D:/Dev/appZeno/ADDies/backend/.env";
const uriLine = fs
  .readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .find((l) => /^DATABASE_URL=/.test(l));
if (!uriLine) {
  console.error("NO DATABASE_URL in backend/.env");
  process.exit(2);
}
const uri = uriLine.replace(/^DATABASE_URL=/, "").trim().replace(/^"|"$/g, "");

await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
const Order = mongoose.connection.collection("orders");

const [field, value, limitStr] = process.argv.slice(2);
if (field) {
  const filterField = field === "paymentStatus" ? "paymentStatus" : "orderStatus";
  const filter = { [filterField]: value };
  const total = await Order.countDocuments(filter);
  const rows = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(Number(limitStr) || 3)
    .lean();
  const map = (r) => ({
    id: String(r._id),
    orderId: r.orderId,
    grandTotal: r.grandTotal,
    orderStatus: r.orderStatus,
    paymentStatus: r.paymentStatus,
    createdAt: r.timestamps?.createdAt ?? null,
  });
  console.log(JSON.stringify({ field: filterField, value, total, count: rows.length, orders: rows.map(map) }, null, 2));
} else {
  const byOrderStatus = await Order.aggregate([
    { $group: { _id: "$orderStatus", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  const byPaymentStatus = await Order.aggregate([
    { $group: { _id: "$paymentStatus", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  console.log("TOTAL:", await Order.countDocuments({}));
  console.log("BY_ORDER_STATUS:", JSON.stringify(byOrderStatus));
  console.log("BY_PAYMENT_STATUS:", JSON.stringify(byPaymentStatus));
}

await mongoose.disconnect();
