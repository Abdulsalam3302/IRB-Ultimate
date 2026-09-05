#!/usr/bin/env node
// Two synthetic INSTREAM requests from the API host. No uploads or DB writes.
// Run only with CLAMAV_HOST set to the assigned internal Render hostname.
import { createConnection } from "node:net";

const host = process.env.CLAMAV_HOST?.trim();
const port = Number(process.env.CLAMAV_PORT || "3310");
if (!host || !/^[a-z0-9][a-z0-9-]*$/i.test(host) || !Number.isInteger(port) || port !== 3310) {
  throw new Error("Use the single-label internal scanner hostname and TCP port 3310.");
}

function scan(bytes) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let reply = Buffer.alloc(0);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(new Error(error));
      else resolve(reply.toString("utf8"));
    };
    const deadline = setTimeout(() => finish("scanner_timeout"), 15000);
    socket.once("connect", () => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      socket.write(Buffer.concat([Buffer.from("zINSTREAM\0"), length, bytes, Buffer.alloc(4)]));
    });
    socket.on("data", data => {
      if (reply.length + data.length > 4096) { finish("scanner_response_too_large"); return; }
      reply = Buffer.concat([reply, data]);
    });
    socket.once("end", () => finish());
    socket.once("error", () => finish("scanner_unreachable"));
    socket.once("close", () => { if (!settled) finish("scanner_connection_closed"); });
  });
}

const start = Date.now();
const receipt = { checkedAt: new Date().toISOString(), syntheticOnly: true, applicationWrites: false, port, requestsAttempted: 0 };
try {
  receipt.requestsAttempted++;
  receipt.cleanAccepted = await scan(Buffer.from("%PDF-1.4\nIRB synthetic scanner check\n%%EOF\n")) === "stream: OK\0";
  // Standard harmless antivirus test marker, kept in memory and never uploaded.
  const marker = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");
  receipt.requestsAttempted++;
  receipt.testMarkerRejected = /^stream: [^\x00-\x1f\x7f]{1,512} FOUND\0$/.test(await scan(Buffer.from(marker)));
  receipt.passed = receipt.cleanAccepted && receipt.testMarkerRejected;
} catch (error) {
  receipt.passed = false;
  receipt.failure = error.message;
}
receipt.latencyMs = Date.now() - start;
console.log(JSON.stringify(receipt, null, 2));
if (!receipt.passed) process.exitCode = 1;
