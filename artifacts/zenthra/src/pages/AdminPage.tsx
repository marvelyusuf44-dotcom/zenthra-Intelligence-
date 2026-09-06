// src/pages/AdminPage.tsx
//
// Internal control center — separate from the public product (no nav item
// links here; see App.tsx's navGroups, which the Master Blueprint specifies
// exactly and does not include Admin).
//
// SECURITY: the admin key is held in component state ONLY. It is never
// written to localStorage/sessionStorage/cookies, so it never persists
// across a refresh or a new tab — you re-enter it each session. That's a
// deliberate fix: the previous version of this page stored the key in
// localStorage and sent it on every request, which is exactly what the
// project's own .env.example warns against ("never send this to the
// frontend"). This keeps the existing shared-secret model from
// middleware/auth.ts (see requireAdmin) rather than introducing a new
// per-user admin-role system — that would touch the schema, registration,
// and login flow, which is a much bigger change than the Blueprint asked
// for here.

import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Activity, AlertTriangle, Check, Database, KeyRound, RefreshCw, ShieldAlert, Users, X } from "lucide-react";

interface AdminUser { id: string; email: string; createdAt: string; tier: string; subscriptionStatus: string; currentPeriodEnd: string | null }
interface Claim { id: string; userId: string; tier: string; note: string | null; status: string; createdAt: string }
interface UsageSummary { date: string; totals: Record<string, number>; activePrincipals: { web: number; whatsapp: number } }
interface DataSource { name: string; configured: boolean; note: string }
interface DataSourcesResponse { sources: DataSource[]; tiers: { id: string; label: string }[]; generatedAt: string }

const SECTIONS = ["overview", "users", "claims", "usage", "sources"] as const;
type Section = (typeof SECTIONS)[number];

function adminFetch<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  return customFetch<T>(path, { ...init, headers: { ...(init?.headers ?? {}), "x-admin-secret": key } });
}

function KeyGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-foreground">
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) onUnlock(value.trim()); }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6"
      >
        <div className="mb-4 flex items-center gap-2 text-slate-200"><ShieldAlert size={18} className="text-blue-400" /><h1 className="text-sm font-medium">Zenthra internal control center</h1></div>
        <label className="block text-xs text-slate-500">
          Admin key
          <input
            data-testid="input-admin-secret"
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 font-data text-sm text-slate-200 outline-none focus:border-blue-500/60"
            placeholder="ADMIN_API_SECRET"
          />
        </label>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-600"><KeyRound size={12} className="mt-0.5 shrink-0" />Held in memory for this tab only — never saved. You'll re-enter it after a refresh.</p>
        <button data-testid="button-admin-unlock" className="mt-4 w-full rounded-lg bg-blue-500 py-2.5 text-sm font-medium text-white hover:bg-blue-400">Continue</button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [sources, setSources] = useState<DataSourcesResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadAll = async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const [u, c, us, ds] = await Promise.all([
        adminFetch<AdminUser[]>(key, "/api/admin/users"),
        adminFetch<Claim[]>(key, "/api/billing/admin/claims?status=pending"),
        adminFetch<UsageSummary>(key, "/api/admin/usage-today"),
        adminFetch<DataSourcesResponse>(key, "/api/admin/data-sources"),
      ]);
      setUsers(u); setClaims(c); setUsage(us); setSources(ds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That admin key was rejected.");
    } finally { setLoading(false); }
  };

  const unlock = (key: string) => { setAdminKey(key); void loadAll(key); };

  const decideClaim = async (claimId: string, decision: "confirm" | "reject") => {
    if (!adminKey) return;
    setActioning(claimId);
    try {
      await adminFetch(adminKey, `/api/billing/admin/${decision === "confirm" ? "confirm-payment" : "reject-payment"}`, { method: "POST", body: JSON.stringify({ claimId }) });
      await loadAll(adminKey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setActioning(null); }
  };

  if (!adminKey) return <KeyGate onUnlock={unlock} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="font-display text-xl font-semibold text-slate-100">Control center</h1><p className="mt-1 text-xs text-slate-600">Read-only, admin-key gated. See middleware/auth.ts's requireAdmin.</p></div>
        <button data-testid="button-admin-refresh" onClick={() => void loadAll(adminKey)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-blue-500/40"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh</button>
      </div>

      {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[.06] p-3 text-xs text-rose-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}

      <div className="mb-6 flex gap-1 border-b border-slate-800">
        {SECTIONS.map((s) => (
          <button key={s} data-testid={`tab-admin-${s}`} onClick={() => setSection(s)} className={`px-3 py-2 text-xs capitalize transition-colors ${section === s ? "border-b-2 border-blue-500 text-blue-300" : "text-slate-500 hover:text-slate-300"}`}>{s}</button>
        ))}
      </div>

      {section === "overview" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="panel rounded-xl p-4"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[.1em] text-slate-500"><Users size={13} />Users</div><div className="mt-2 font-display text-2xl text-slate-100">{users?.length ?? "—"}</div></div>
          <div className="panel rounded-xl p-4"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[.1em] text-slate-500"><Activity size={13} />Chat calls today</div><div className="mt-2 font-display text-2xl text-slate-100">{usage?.totals.chat ?? "—"}</div></div>
          <div className="panel rounded-xl p-4"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[.1em] text-slate-500"><Database size={13} />Sources configured</div><div className="mt-2 font-display text-2xl text-slate-100">{sources ? `${sources.sources.filter((s) => s.configured).length}/${sources.sources.length}` : "—"}</div></div>
          <div className="panel col-span-full rounded-xl p-4"><div className="mb-2 text-[11px] uppercase tracking-[.1em] text-slate-500">Pending payment claims</div><div className="text-2xl font-display text-slate-100">{claims?.length ?? "—"}</div></div>
        </div>
      )}

      {section === "users" && (
        <div className="panel overflow-x-auto rounded-xl"><table className="w-full min-w-[500px] text-left text-xs"><thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-[.1em] text-slate-600"><th className="px-4 py-3">Email</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Joined</th></tr></thead><tbody>
          {users?.map((u) => <tr key={u.id} className="border-b border-slate-800/60 last:border-0"><td className="px-4 py-3 text-slate-200">{u.email}</td><td className="px-4 py-3 text-slate-400">{u.tier}</td><td className="px-4 py-3 text-slate-400">{u.subscriptionStatus}</td><td className="px-4 py-3 font-data text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td></tr>)}
        </tbody></table>{!users?.length && <div className="p-6 text-center text-xs text-slate-600">No users yet.</div>}</div>
      )}

      {section === "claims" && (
        <div className="space-y-2">
          {claims?.length ? claims.map((c) => (
            <div key={c.id} className="panel flex items-center gap-3 rounded-xl p-4">
              <div className="flex-1"><div className="text-sm text-slate-200">Tier: {c.tier}</div><div className="mt-0.5 text-[11px] text-slate-600">{c.note || "No note"} · {new Date(c.createdAt).toLocaleString()}</div></div>
              <button data-testid={`button-confirm-claim-${c.id}`} disabled={actioning === c.id} onClick={() => void decideClaim(c.id, "confirm")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-400/20"><Check size={13} />Confirm</button>
              <button data-testid={`button-reject-claim-${c.id}`} disabled={actioning === c.id} onClick={() => void decideClaim(c.id, "reject")} className="inline-flex items-center gap-1 rounded-lg bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-400/20"><X size={13} />Reject</button>
            </div>
          )) : <div className="panel rounded-xl p-6 text-center text-xs text-slate-600">No pending claims.</div>}
        </div>
      )}

      {section === "usage" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel rounded-xl p-4"><h2 className="mb-3 text-[11px] uppercase tracking-[.1em] text-slate-500">Calls today by category</h2>{usage ? Object.entries(usage.totals).map(([k, v]) => <div key={k} className="flex items-center justify-between py-1 text-sm"><span className="capitalize text-slate-400">{k}</span><span className="font-data text-slate-200">{v}</span></div>) : <div className="text-xs text-slate-600">—</div>}</div>
          <div className="panel rounded-xl p-4"><h2 className="mb-3 text-[11px] uppercase tracking-[.1em] text-slate-500">Active principals today</h2>{usage ? <><div className="flex items-center justify-between py-1 text-sm"><span className="text-slate-400">Web</span><span className="font-data text-slate-200">{usage.activePrincipals.web}</span></div><div className="flex items-center justify-between py-1 text-sm"><span className="text-slate-400">WhatsApp</span><span className="font-data text-slate-200">{usage.activePrincipals.whatsapp}</span></div></> : <div className="text-xs text-slate-600">—</div>}</div>
          <div className="panel col-span-full rounded-xl border-dashed p-4 text-xs text-slate-600">Deeper AI-usage analytics (trends, per-user breakdown) need a metrics pipeline this build doesn't have yet — this is today's raw count only.</div>
        </div>
      )}

      {section === "sources" && (
        <div className="space-y-2">
          {sources?.sources.map((s) => (
            <div key={s.name} className="panel flex items-center gap-3 rounded-xl p-4"><div className={`h-2 w-2 rounded-full ${s.configured ? "bg-emerald-300" : "bg-slate-600"}`} /><div className="flex-1"><div className="text-sm text-slate-200">{s.name}</div><div className="mt-0.5 text-[11px] text-slate-600">{s.note}</div></div><span className={`text-xs ${s.configured ? "text-emerald-300" : "text-slate-500"}`}>{s.configured ? "Configured" : "Not configured"}</span></div>
          ))}
          <div className="panel rounded-xl border-dashed p-4 text-xs text-slate-600">System health/logs need a log-aggregation pipeline this build doesn't run yet — configuration status above is what's real today.</div>
        </div>
      )}
    </div>
  );
}
