/**
 * Operator dry-run for historical reprocessing (issue #1108).
 *
 * Estimates the impact of reprocessing a historical ledger range — affected
 * ledgers, rows, duration, and storage — WITHOUT executing the replay or
 * writing any data. Returns a bounded report an operator can review before
 * committing to an expensive backfill.
 */
import { db } from "../db.js";

// How many rows the indexer can decode per second (used for duration estimates).
const DEFAULT_DECODE_ROWS_PER_SECOND = 500;

// A single indexed event row is small; this bounds the storage estimate.
const AVG_ROW_BYTES = 1_500;

function requireRange(from, to) {
  const f = Number(from);
  const t = Number(to);
  if (!Number.isFinite(f) || !Number.isFinite(t) || f < 0 || t < 0 || t < f) {
    throw new Error("invalid ledger range: from and to must be non-negative integers with to >= from");
  }
  return { from: f, to: t };
}

/**
 * Estimate reprocessing impact for a ledger range.
 *
 * @param {{ from: number | string, to: number | string }} range
 * @param {{ query?: Function }} [deps]  injected dependencies for testing
 * @returns {Promise<{ from, to, ledgersAffected, rowsEstimated, estimatedDurationMs, estimatedStorageBytes, digest }>}
 */
export async function replayDryRun({ from, to }, { query } = {}) {
  const { from: f, to: t } = requireRange(from, to);
  const q = query ?? ((text, params) => db.query(text, params));

  // Fast path: count rows and distinct ledgers in the range without pulling
  // full rows (avoids materialising large result sets).
  const [{ rows: countRows }] = await q(
    `SELECT COUNT(*)::INT AS row_count, COUNT(DISTINCT ledger) AS ledger_count
     FROM events WHERE ledger BETWEEN $1 AND $2`,
    [f, t],
  );
  const rowsEstimated = Number(countRows.row_count ?? 0);
  const ledgersAffected = Number(countRows.ledger_count ?? 0);

  // Estimate storage as avg row bytes * row count.
  const estimatedStorageBytes = rowsEstimated * AVG_ROW_BYTES;

  // Estimate duration based on decode throughput. Rows may decode one-to-one
  // or one-to-many; conservatively assume one row per event.
  const estimatedDurationMs =
    rowsEstimated > 0 ? Math.round((rowsEstimated / DEFAULT_DECODE_ROWS_PER_SECOND) * 1_000) : 0;

  // Deterministic digest of the rows currently in range — lets an operator
  // verify the dry-run reflected the actual production state at run time.
  const digest = await replayDigest(f, t, q);

  return {
    from: f,
    to: t,
    ledgersAffected,
    rowsEstimated,
    estimatedDurationMs,
    estimatedStorageBytes,
    digest,
  };
}

/**
 * Compute a canonical digest of all event rows in the ledger range. Used to
 * detect concurrent backfill/reorg between the dry-run and the real replay.
 */
async function replayDigest(from, to, q) {
  const crypto = await import("node:crypto");
  const { rows } = await q(
    `SELECT seq, contract_id, function, ledger, tx_hash, description
     FROM events WHERE ledger BETWEEN $1 AND $2 ORDER BY seq`,
    [from, to],
  );
  const payload = rows
    .map((r) => `${r.seq}|${r.contract_id}|${r.function}|${r.ledger}|${r.tx_hash}|${r.description}`)
    .join("\n");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export { DEFAULT_DECODE_ROWS_PER_SECOND, AVG_ROW_BYTES, requireRange };
