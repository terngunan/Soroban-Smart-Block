/**
 * Issue #1108 — operator dry-run for historical reprocessing.
 * Tests replayDryRun estimates with injected query stubs (no live network/DB).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replayDryRun, requireRange } from "../src/replay/dryrun.js";

class FakeQuery {
  constructor(rows, ledgerCount) {
    this.rows = rows;
    this.ledgerCount = ledgerCount;
    this.calls = [];
  }
  async query(text, params) {
    this.calls.push({ text, params });
    return {
      rows: [
        {
          row_count: this.rows,
          ledger_count: this.ledgerCount,
        },
      ],
    };
  }
}

function makeQuery(rowCount, ledgerCount) {
  return new FakeQuery(rowCount, ledgerCount);
}

describe("requireRange", () => {
  it("parses a valid numeric range", () => {
    assert.deepEqual(requireRange(10, 20), { from: 10, to: 20 });
    assert.deepEqual(requireRange("100", "200"), { from: 100, to: 200 });
  });

  it("rejects to < from", () => {
    assert.throws(() => requireRange(20, 10), /invalid ledger range/);
  });

  it("rejects negative ledgers", () => {
    assert.throws(() => requireRange(-1, 10), /invalid ledger range/);
  });

  it("rejects non-numeric input", () => {
    assert.throws(() => requireRange("abc", "def"), /invalid ledger range/);
  });
});

describe("replayDryRun", () => {
  it("returns full estimate shape for a populated range", async () => {
    const q = makeQuery(1234, 56);
    const result = await replayDryRun({ from: 100, to: 200 }, { query: (t, p) => q.query(t, p) });

    assert.deepEqual(result.from, 100);
    assert.deepEqual(result.to, 200);
    assert.deepEqual(result.ledgersAffected, 56);
    assert.deepEqual(result.rowsEstimated, 1234);
    assert.ok(Number.isInteger(result.estimatedDurationMs));
    assert.ok(result.estimatedDurationMs > 0);
    assert.ok(Number.isInteger(result.estimatedStorageBytes));
    assert.ok(result.estimatedStorageBytes > 0);
    assert.equal(typeof result.digest, "string");
    assert.equal(result.digest.length, 64); // sha256 hex

    // Verify the query used BETWEEN with the correct params
    assert.equal(q.calls[0].params[0], 100);
    assert.equal(q.calls[0].params[1], 200);
    assert.ok(q.calls[0].text.includes("BETWEEN"));
    assert.ok(q.calls[0].text.includes("COUNT(DISTINCT ledger)"));
  });

  it("returns zeros for an empty range", async () => {
    const q = makeQuery(0, 0);
    const result = await replayDryRun({ from: 5000, to: 6000 }, { query: (t, p) => q.query(t, p) });

    assert.deepEqual(result.rowsEstimated, 0);
    assert.deepEqual(result.ledgersAffected, 0);
    assert.deepEqual(result.estimatedDurationMs, 0);
    assert.deepEqual(result.estimatedStorageBytes, 0);
  });

  it("rejects invalid range", async () => {
    const q = makeQuery(0, 0);
    await assert.rejects(
      replayDryRun({ from: "abc", to: "def" }, { query: (t, p) => q.query(t, p) }),
      (err) => err.message.includes("invalid ledger range"),
    );
    await assert.rejects(
      replayDryRun({ from: 100, to: 50 }, { query: (t, p) => q.query(t, p) }),
      (err) => err.message.includes("invalid ledger range"),
    );
  });

  it("estimates duration proportional to row count", async () => {
    const q1 = makeQuery(500, 1);
    const r1 = await replayDryRun({ from: 1, to: 10 }, { query: (t, p) => q1.query(t, p) });

    const q2 = makeQuery(1000, 1);
    const r2 = await replayDryRun({ from: 1, to: 10 }, { query: (t, p) => q2.query(t, p) });

    assert.ok(r2.estimatedDurationMs > r1.estimatedDurationMs);
    // 500 rows at 500 rows/s = 1000ms
    assert.deepEqual(r1.estimatedDurationMs, 1000);
  });
});
