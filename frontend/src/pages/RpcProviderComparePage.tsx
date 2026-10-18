/**
 * RPC Provider Quality Comparison view (issue #1111).
 *
 * Compares latency, error rate, and ledger freshness across configured RPC
 * providers to inform failover decisions. Polls GET /api/rpc/compare.
 */
import { useEffect, useState } from "react";

interface ProviderRow {
  url: string;
  healthy: boolean;
  uptime: number;
  avgLatency: number | null;
  p95Latency: number | null;
  errorRate: number;
  latestLedger: number | null;
  ledgerFreshness: number | null;
  healthScore: number;
  disagreements: number;
}

interface Comparison {
  providers: ProviderRow[];
  best: ProviderRow | null;
  worst: ProviderRow | null;
  summary: {
    totalProviders: number;
    healthyCount: number;
    avgLatency: number | null;
    avgErrorRate: number | null;
  };
}

function StatusBadge({ healthy }: { healthy: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        background: healthy ? "#d1fae5" : "#fee2e2",
        color: healthy ? "#065f46" : "#991b1b",
      }}
    >
      {healthy ? "UP" : "DOWN"}
    </span>
  );
}

function FreshnessBadge({ freshness }: { freshness: number | null }) {
  if (freshness == null) return <span style={{ color: "#888" }}>—</span>;
  const bad = freshness > 5;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: bad ? "#dc2626" : "#16a34a",
      }}
    >
      {freshness === 0 ? "current" : `+${freshness} ledgers`}
    </span>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(Math.max(value / max, 0), 1) * 100;
  return (
    <div style={{ width: "100%", height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: pct < 33 ? "#22c55e" : pct < 66 ? "#eab308" : "#ef4444" }} />
    </div>
  );
}

export default function RpcProviderComparePage() {
  const [data, setData] = useState<Comparison | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchComparison = async () => {
    try {
      const res = await fetch("/api/rpc/compare");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchComparison();
    const id = setInterval(fetchComparison, 15_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div>
        <h2>RPC Provider Comparison</h2>
        <div style={{ padding: 12, background: "#fee2e2", borderRadius: 6, color: "#991b1b" }}>
          Failed to load comparison: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div><h2>RPC Provider Comparison</h2><p style={{ color: "#888" }}>Loading…</p></div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>RPC Provider Comparison</h2>
        {lastUpdated && <span style={{ fontSize: 12, color: "#888" }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      <div style={{ gridColumn: "1 / -1", background: "#f9fafb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Providers</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{data.summary.totalProviders}</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Healthy</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: data.summary.healthyCount === data.summary.totalProviders ? "#16a34a" : "#dc2626" }}>
              {data.summary.healthyCount}/{data.summary.totalProviders}
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Avg Latency</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {data.summary.avgLatency != null ? `${data.summary.avgLatency} ms` : "—"}
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Avg Error Rate</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {data.summary.avgErrorRate != null ? `${data.summary.avgErrorRate}%` : "—"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {data.providers.map((p) => (
          <div key={p.url} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <code style={{ fontSize: 13, wordBreak: "break-all" }}>{p.url}</code>
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                  Ledger #{p.latestLedger ?? "—"} · Health score {p.healthScore}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <StatusBadge healthy={p.healthy} />
                <FreshnessBadge freshness={p.ledgerFreshness} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#f9fafb", borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Avg Latency</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{p.avgLatency != null ? `${p.avgLatency} ms` : "—"}</div>
                <Bar value={p.avgLatency ?? 0} max={2000} />
              </div>
              <div style={{ background: "#f9fafb", borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Error Rate</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: p.errorRate > 10 ? "#dc2626" : "#111827" }}>
                  {p.errorRate}%
                </div>
                <Bar value={p.errorRate} max={100} />
              </div>
              <div style={{ background: "#f9fafb", borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Uptime</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: p.uptime < 90 ? "#dc2626" : "#111827" }}>
                  {p.uptime}%
                </div>
                <Bar value={p.uptime} max={100} />
              </div>
            </div>

            <div style={{ background: "#f9fafb", borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>Ledger Freshness</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {p.ledgerFreshness == null ? "unknown" : p.ledgerFreshness === 0 ? "current" : `+${p.ledgerFreshness} ledgers`}
                </div>
                <Bar value={p.ledgerFreshness ?? 0} max={20} />
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
              Disagreements: {p.disagreements}
            </div>
            {p === data.best && (
              <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Best failover target</div>
            )}
            {p === data.worst && p !== data.best && (
              <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>Worst performing</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
