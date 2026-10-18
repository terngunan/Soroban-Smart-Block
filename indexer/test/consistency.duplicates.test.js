/**
 * Issue #1109 — consistency check for duplicate transaction events.
 * Tests `db.getDuplicateEventIdentities()` with an injected query stub
 * (no live network/DB dependency).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// DATABASE_URL must be set before db.js (and thus config.js) is imported.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost:5432/test";

// ── Fake pool.query ──────────────────────────────────────────────────────────

class FakeQuery {
  constructor(script) {
    this.script = script; // "empty" | "duplicates" | "error"
    this.calls = [];
  }
  async query(text, params) {
    this.calls.push({ text, params });
    if (this.script === "error") throw new Error("DB connection failed");
    const isEventId = text.includes("event_id");
    const isIngest = text.includes("contract_id");
    const isCount = text.includes("COUNT(*)") && !isEventId && !isIngest;
    if (this.script === "empty") {
      return { rows: [] };
    }
    // "duplicates": return a total count plus one duplicate group per identity kind
    if (isCount) {
      return { rows: [{ total: "5" }] };
    }
    if (isEventId) {
      return {
        rows: [
          {
            identity: "evt_abc_123",
            kind: "event_id",
            count: "2",
            seqs: [10, 11],
          },
        ],
      };
    }
    if (isIngest) {
      return {
        rows: [
          {
            identity: "C1:100:tx_1",
            kind: "ingestion_key",
            count: "3",
            seqs: [20, 21, 22],
          },
        ],
      };
    }
    return { rows: [] };
  }
}

async function loadDbWithFake(script) {
  const fake = new FakeQuery(script);
  const mod = await import("../src/db.js");
  const origQuery = mod.pool.query.bind(mod.pool);
  mod.pool.query = (...args) => fake.query(...args);
  return {
    db: mod.db,
    pool: mod.pool,
    fake,
    restore: () => { mod.pool.query = origQuery; },
  };
}

describe("getDuplicateEventIdentities", () => {
  it("reports no duplicates when the table is clean", async () => {
    const { db, restore } = await loadDbWithFake("empty");
    try {
      const report = await db.getDuplicateEventIdentities();

      assert.equal(report.totalEvents, 0);
      assert.equal(report.uniqueIdentities, 0);
      assert.deepEqual(report.duplicateGroups, []);
      assert.equal(report.duplicatesDetected, false);
    } finally {
      restore();
    }
  });

  it("reports duplicate groups without double-counting members", async () => {
    const { db, restore } = await loadDbWithFake("duplicates");
    try {
      const report = await db.getDuplicateEventIdentities();

      assert.ok(report.totalEvents > 0);
      assert.equal(report.duplicateGroups.length, 2);
      assert.equal(report.duplicatesDetected, true);

      const byKind = Object.fromEntries(report.duplicateGroups.map((g) => [g.kind, g]));
      assert.equal(byKind.event_id.count, 2);
      assert.deepEqual(byKind.event_id.seqs, [10, 11]);
      assert.equal(byKind.event_id.identity, "evt_abc_123");
      assert.equal(byKind.ingestion_key.count, 3);
      assert.deepEqual(byKind.ingestion_key.seqs, [20, 21, 22]);
      assert.equal(byKind.ingestion_key.identity, "C1:100:tx_1");

      // uniqueIdentities = total - duplicate members + groups (no double-count)
      const dupMembers = report.duplicateGroups.reduce((s, g) => s + g.count, 0);
      assert.equal(report.uniqueIdentities, report.totalEvents - dupMembers + report.duplicateGroups.length);
    } finally {
      restore();
    }
  });

  it("propagates DB failures", async () => {
    const { db, restore } = await loadDbWithFake("error");
    try {
      await assert.rejects(db.getDuplicateEventIdentities(), /DB connection failed/);
    } finally {
      restore();
    }
  });
});
