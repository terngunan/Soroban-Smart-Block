/**
 * Issue #1107 — report decode outcomes by failure category.
 * Tests classifyDecodeFailure, outcomeForDecodedRecord, and getDecodeOutcomeStats.
 * No live network dependency.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DECODE_OUTCOMES,
  classifyDecodeFailure,
  outcomeForDecodedRecord,
  getDecodeOutcomeStats,
} from "../src/decoder.js";

describe("DECODE_OUTCOMES", () => {
  it("is a bounded, closed set of labels", () => {
    assert.deepEqual(DECODE_OUTCOMES, [
      "success",
      "unsupported_type",
      "missing_abi",
      "invalid_xdr",
      "abi_mismatch",
      "schema_violation",
      "unknown",
    ]);
  });
});

describe("classifyDecodeFailure", () => {
  it("maps XDR/unsupported-type errors to unsupported_type", () => {
    assert.equal(
      classifyDecodeFailure(new Error("unsupported arm in union switch")),
      "unsupported_type",
    );
    assert.equal(
      classifyDecodeFailure(new Error("unknown arm")),
      "unsupported_type",
    );
    assert.equal(
      classifyDecodeFailure(new Error("bad union switch")),
      "unsupported_type",
    );
    assert.equal(
      classifyDecodeFailure(new Error("not implemented")),
      "unsupported_type",
    );
  });

  it("maps malformed XDR to invalid_xdr", () => {
    assert.equal(classifyDecodeFailure(new Error("invalid xdr")), "invalid_xdr");
    assert.equal(classifyDecodeFailure(new Error("malformed base64")), "invalid_xdr");
    assert.equal(classifyDecodeFailure(new Error("xdr parse failed")), "invalid_xdr");
  });

  it("maps missing ABI/spec to missing_abi", () => {
    assert.equal(classifyDecodeFailure(new Error("no registered abi")), "missing_abi");
    assert.equal(classifyDecodeFailure(new Error("no on-chain spec")), "missing_abi");
    assert.equal(classifyDecodeFailure(new Error("abi_missing")), "missing_abi");
  });

  it("maps ABI mismatch to abi_mismatch", () => {
    assert.equal(classifyDecodeFailure(new Error("abi_arity_mismatch:2:1")), "abi_mismatch");
    assert.equal(classifyDecodeFailure(new Error("abi_type_mismatch:1:address")), "abi_mismatch");
    assert.equal(classifyDecodeFailure(new Error("abi_mismatch")), "abi_mismatch");
  });

  it("maps schema violations to schema_violation", () => {
    assert.equal(classifyDecodeFailure(new Error("schema validation failed")), "schema_violation");
    assert.equal(classifyDecodeFailure(new Error("schema_violation")), "schema_violation");
    assert.equal(classifyDecodeFailure(new Error("ajv error")), "schema_violation");
  });

  it("maps anything else to unknown", () => {
    assert.equal(classifyDecodeFailure(new Error("something unexpected")), "unknown");
    assert.equal(classifyDecodeFailure(new Error("")), "unknown");
    assert.equal(classifyDecodeFailure(new Error(null)), "unknown");
    assert.equal(classifyDecodeFailure({}), "unknown");
  });

  it("never returns success for a failure", () => {
    const result = classifyDecodeFailure(new Error("unsupported arm"));
    assert.notEqual(result, "success");
  });
});

describe("outcomeForDecodedRecord", () => {
  it("returns success for a decoded record", () => {
    assert.equal(outcomeForDecodedRecord({ contract_id: "C", function: "f" }), "success");
  });

  it("returns unknown for null/undefined", () => {
    assert.equal(outcomeForDecodedRecord(null), "unknown");
    assert.equal(outcomeForDecodedRecord(undefined), "unknown");
  });
});

describe("getDecodeOutcomeStats", () => {
  it("returns a complete map keyed by every bounded outcome", () => {
    const stats = getDecodeOutcomeStats();
    assert.ok(stats.byOutcome);
    assert.equal(typeof stats.total, "number");
    assert.equal(stats.window, "24h");
    for (const category of DECODE_OUTCOMES) {
      assert.ok(category in stats.byOutcome, `missing category ${category}`);
      assert.equal(typeof stats.byOutcome[category], "number");
    }
  });

  it("starts with zero counts", () => {
    const stats = getDecodeOutcomeStats();
    let sum = 0;
    for (const category of DECODE_OUTCOMES) sum += stats.byOutcome[category];
    assert.equal(sum, stats.total);
  });
});
