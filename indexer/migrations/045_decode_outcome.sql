-- Migration 045 (issue #1107): report decode outcomes by failure category.
--
-- `decode_outcome` is a bounded, operator-facing label that classifies how an
-- event was decoded. It is complementary to `decode_status` (which describes
-- *trust*: verified / unverified / heuristic) — `decode_outcome` describes the
-- *result*: success, or one of a fixed set of failure categories.
--
-- Categories (kept bounded — see DECODE_OUTCOMES in decoder.js):
--   success            decoded without error
--   unsupported_type   XDR arm / ScVal kind the decoder does not handle
--   missing_abi        no registered ABI and no on-chain spec available
--   invalid_xdr        XDR parse failure (bad union switch, malformed bytes)
--   abi_mismatch       ABI present but args did not match the declared shape
--   schema_violation   decoded output failed Ajv schema validation
--   unknown            catch-all for unexpected errors
--
-- New rows default to 'success'; rows indexed before this migration keep NULL
-- until the re-decode worker re-processes them. Analytics queries coalesce
-- NULL to 'success' (a row with a valid decode_status is treated as successful
-- until proven otherwise by a re-decode).

ALTER TABLE events ADD COLUMN IF NOT EXISTS decode_outcome TEXT DEFAULT 'success';

-- Fast filter for the outcomes analytics endpoint.
CREATE INDEX IF NOT EXISTS idx_events_decode_outcome ON events (decode_outcome);