import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminPage from "./pages/AdminPage";
import {
  Activity, ArrowUpRight, BarChart3, Bell,
  Building2, Camera, ChevronRight, CircleAlert, Coins, Compass, Copy, Database,
  ExternalLink, FileCode2, Gauge, KeyRound, LayoutDashboard, LogOut, Menu,
  MessageSquare, Mic, Paperclip, Plus, Radar, RefreshCw, RotateCcw, Search, Send,
  ShieldCheck, Sparkles, Star, Tag, ThumbsDown, ThumbsUp, TrendingUp, User, Wallet, X, Zap,
} from "lucide-react";
import {
  getGetMarketsQueryKey, getGetSignalsQueryKey, getGetWalletQueryKey,
  useGetMarkets, useGetSignals, useGetWallet, useHealthCheck, useSendChat,
} from "@workspace/api-client-react";
import { customFetch, setAuthTokenGetter } from "@workspace/api-client-react";
import type { ChatMessage, ConfluenceCategory, Market, Signal, WalletAnalysis } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import PricingPage from "@/pages/pricing";
import zenthraLogo from "@/assets/zenthra-logo.png";
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams, useSearch } from "wouter";

const queryClient = new QueryClient();

type Icon = ComponentType<{ size?: number; className?: string }>;
type Tone = "slate" | "blue" | "green" | "red" | "amber";
type ChatMsg = ChatMessage;

// Blueprint's initial Futures Intelligence universe (10 assets) — kept in
// sync with WATCHLIST in api-server/src/lib/live-signals.ts.
const FUTURES_UNIVERSE = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "SUIUSDT", "AVAXUSDT", "LINKUSDT", "ADAUSDT"];

// The Blueprint's exact sidebar IA. "Watchlist"/"Alerts" from the old build
// are folded into Monitor rather than kept as separate nav items — that
// matches this list precisely instead of carrying over legacy pages.
const navGroups = [
  { label: "Core", items: [["ai", "AI Research", Sparkles], ["discover", "Discover", Compass], ["futures", "Futures", Zap], ["markets", "Markets", TrendingUp]] },
  { label: "Intelligence", items: [["wallet", "Wallets", Wallet], ["entities", "Entities", Building2], ["smartmoney", "Smart Money", Radar], ["signal", "Signals", Activity], ["monitor", "Monitor", Gauge]] },
  { label: "Account", items: [["pricing", "Pricing", Tag], ["account", "Account", User]] },
] as const;

const DISCOVER_PROMPTS = [
  { label: "Unusual activity", question: "Find unusual on-chain activity today.", icon: Radar },
  { label: "Whale accumulation", question: "Who is accumulating SOL right now?", icon: Wallet },
  { label: "Smart money", question: "What are whales buying this week?", icon: Sparkles },
  { label: "Emerging tokens", question: "Are there any emerging tokens worth a closer look this week?", icon: Coins },
  { label: "Market anomalies", question: "Why is this token suddenly moving?", icon: Activity },
  { label: "Futures setups", question: "Are there interesting futures setups right now?", icon: Zap },
] as const;

// -----------------------------------------------------------------------
// Local response shapes for endpoints that still don't have a generated
// hook (they predate the OpenAPI spec: /token/:symbol, /watchlist,
// /alerts, /onchain/*, /history). Signals now use the generated `Signal`/
// `ConfluenceCategory` types directly — see lib/api-spec/openapi.yaml.
// -----------------------------------------------------------------------
interface TokenDetail extends Market {
  supply: number | null;
  holders: number | null;
  similarTokens: Market[];
  sentiment: "constructive" | "cautious";
}
interface DegradedFeed<T extends string> { status: "unavailable"; message: string; [key: string]: unknown }
interface WatchlistItem { id: string; kind: "token" | "wallet"; value: string; label?: string | null; created_at: string }
interface AlertItem { id: string; kind: "price" | "wallet" | "volume"; target: string; condition: string; active: boolean; created_at: string }

function useWatchlist() {
  return useQuery({ queryKey: ["zenthra-watchlist"], queryFn: () => customFetch<WatchlistItem[]>("/api/watchlist") });
}
function useAlerts() {
  return useQuery({ queryKey: ["zenthra-alerts"], queryFn: () => customFetch<AlertItem[]>("/api/alerts") });
}

// -----------------------------------------------------------------------
// Shared UI primitives
// -----------------------------------------------------------------------

function ZLogo({ size = 24 }: { size?: number }) {
  return <img src={zenthraLogo} width={size} height={size} className="shrink-0 rounded-md object-contain" alt="Zenthra" style={{ width: size, height: size }}/>;
}

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    slate: "border-slate-700/80 bg-slate-800/40 text-slate-400", blue: "border-blue-500/30 bg-blue-500/5 text-blue-400",
    green: "border-emerald-400/30 bg-emerald-400/5 text-emerald-300", red: "border-rose-400/30 bg-rose-400/5 text-rose-300",
    amber: "border-amber-400/30 bg-amber-400/5 text-amber-300",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-data tracking-tight ${colors[tone]}`}>{children}</span>;
}

function PageHeader({ title, subtitle, tag, action }: { title: string; subtitle?: string; tag?: string; action?: ReactNode }) {
  return <header className="mb-6 flex items-start justify-between gap-4">
    <div><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-[25px] font-semibold tracking-[-.03em] text-slate-100">{title}</h1>{tag && <Badge tone="blue">{tag}</Badge>}</div>{subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}</div>
    {action}
  </header>;
}

function StatCard({ icon: StatIcon, label, value, accent = "text-slate-100", detail }: { icon: Icon; label: string; value: string; accent?: string; detail?: string }) {
  return <div className="panel rounded-xl p-4 transition-colors hover:border-slate-600/80">
    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[.11em] text-slate-500"><StatIcon size={14}/>{label}</div>
    <div className={`font-display text-[22px] font-semibold tracking-[-.03em] ${accent}`}>{value}</div>
    {detail && <div className="mt-1 text-[11px] text-slate-600">{detail}</div>}
  </div>;
}

function DataTable({ head, rows }: { head: string[]; rows: ReactNode[] }) {
  return <div className="panel overflow-x-auto rounded-xl"><table className="w-full min-w-[650px] text-left text-[13px]"><thead><tr className="border-b border-slate-800/80 text-[10px] uppercase tracking-[.1em] text-slate-600">{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}
function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) { return <tr onClick={onClick} className={`border-b border-slate-800/60 transition-colors last:border-0 hover:bg-slate-800/30 ${onClick ? "cursor-pointer" : ""}`}>{children}</tr>; }
function Cell({ children, className = "" }: { children: ReactNode; className?: string }) { return <td className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</td>; }
function Format({ value, compact = false }: { value: number; compact?: boolean }) {
  return <>{compact ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value) : new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 }).format(value)}</>;
}
function formatCompact(value: number): string { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value); }

function Skeleton({ className = "" }: { className?: string }) { return <div className={`animate-pulse rounded-md bg-slate-800/70 ${className}`}/>; }
function QueryState({ loading, error, retry }: { loading: boolean; error: boolean; retry: () => void }) {
  if (loading) return <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full"/>)}</div>;
  if (error) return <div className="panel rounded-xl p-6 text-center"><CircleAlert className="mx-auto mb-2 text-amber-300" size={22}/><p className="text-sm text-slate-400">Live data is temporarily unavailable.</p><button data-testid="button-retry-query" onClick={retry} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-blue-500/40"><RefreshCw size={13}/>Retry connection</button></div>;
  return null;
}
/** Honest "no fake data here" state — used anywhere a source isn't wired up yet, instead of showing a placeholder that could be mistaken for real. */
function Unavailable({ message }: { message: string }) {
  return <div className="panel rounded-xl border-dashed p-6 text-center"><Database className="mx-auto mb-2 text-slate-600" size={20}/><p className="text-sm text-slate-500">{message}</p></div>;
}
function tierTone(tier: Signal["tier"]): Tone {
  return tier === "strong_setup" ? "green" : tier === "valid_setup" ? "blue" : tier === "watch" ? "amber" : "slate";
}

// -----------------------------------------------------------------------
// Home
// -----------------------------------------------------------------------

function HomePage() {
  const { data: markets, isLoading, isError, refetch } = useGetMarkets({ query: { queryKey: getGetMarketsQueryKey() } });
  const { data: signalsRaw } = useGetSignals(undefined, { query: { queryKey: getGetSignalsQueryKey() } });
  const signals = signalsRaw;
  const { data: watchlist } = useWatchlist();
  const { data: alerts } = useAlerts();

  const totalCap = markets?.reduce((sum, m) => sum + m.marketCap, 0) ?? null;
  const actionableSignals = signals?.filter((s) => s.call !== "NO_TRADE").length ?? null;
  const activeAlerts = alerts?.filter((a) => a.active).length ?? null;

  return <div className="z-in">
    <PageHeader title="Zenthra" subtitle="Intelligence for the on-chain world. Ask a question — Zenthra does the research." tag="LIVE" action={<Link data-testid="link-open-ai" href="/ai" className="hidden items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/10 sm:flex"><Sparkles size={14}/>Start Research</Link>}/>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={LayoutDashboard} label="Tracked market cap" value={totalCap != null ? `$${formatCompact(totalCap)}` : "—"} detail={markets ? `${markets.length} assets tracked` : undefined}/>
      <StatCard icon={Zap} label="Actionable futures reads" value={actionableSignals != null ? String(actionableSignals) : "—"} accent="text-blue-400" detail={`of ${FUTURES_UNIVERSE.length} tracked pairs`}/>
      <StatCard icon={Star} label="Your watchlist" value={watchlist ? String(watchlist.length) : "—"} detail="Items you're tracking"/>
      <StatCard icon={Bell} label="Active alerts" value={activeAlerts != null ? String(activeAlerts) : "—"} accent="text-amber-300" detail="Monitored conditions"/>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
      <section className="panel overflow-hidden rounded-xl"><div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3"><div><h2 className="text-sm font-medium text-slate-200">Momentum board</h2><p className="mt-0.5 text-[11px] text-slate-600">Top assets by market cap</p></div><Link data-testid="link-markets-from-home" href="/markets" className="text-[11px] text-blue-400 hover:text-blue-300">View all <ChevronRight className="inline" size={12}/></Link></div><div className="p-2"><QueryState loading={isLoading} error={isError} retry={() => void refetch()}/>{!isLoading && !isError && <div className="space-y-1">{(markets ?? []).slice(0, 5).map((m) => <Link data-testid={`row-momentum-${m.symbol}`} key={m.symbol} href={`/token/${m.symbol}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-800/35"><span className="w-5 text-center font-data text-[11px] text-slate-600">{m.rank}</span><div className="grid h-8 w-8 place-items-center rounded-lg border border-blue-500/15 bg-blue-500/5 font-data text-[10px] text-blue-400">{m.symbol.slice(0, 3)}</div><div className="min-w-0 flex-1"><div className="text-sm text-slate-200">{m.name}</div><div className="font-data text-[10px] text-slate-600">{m.symbol}</div></div><div className="font-data text-sm text-slate-200">${<Format value={m.price}/>}</div><div className={`w-16 text-right font-data text-xs ${m.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{m.change24h >= 0 ? "+" : ""}{m.change24h}%</div></Link>)}</div>}</div></section>
      <section className="panel rounded-xl p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-medium text-slate-200">Futures desk</h2><p className="mt-0.5 text-[11px] text-slate-600">Confluence Score across the tracked universe</p></div><div className="soft-pulse h-2 w-2 rounded-full bg-emerald-300"/></div>{signals ? <div className="space-y-1.5">{signals.slice(0, 5).map((s) => <div key={s.pair} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs"><span className="font-data text-slate-300">{s.pair}</span><Badge tone={tierTone(s.tier)}>{s.call}</Badge></div>)}</div> : <Skeleton className="h-32 w-full"/>}<Link data-testid="link-signals-from-home" href="/signal" className="mt-4 flex items-center justify-center gap-1 text-xs text-blue-400">Open signal desk <ChevronRight size={13}/></Link></section>
    </div>
    <section className="mt-4 grid gap-3 sm:grid-cols-3">
      {DISCOVER_PROMPTS.slice(0, 3).map(({ label, question, icon: PromptIcon }) => <Link key={label} href={`/ai?q=${encodeURIComponent(question)}`} className="panel flex items-start gap-3 rounded-xl p-4 transition-colors hover:border-blue-500/40"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-400"><PromptIcon size={15}/></div><div><div className="text-sm text-slate-200">{label}</div><div className="mt-1 text-xs text-slate-600">{question}</div></div></Link>)}
    </section>
  </div>;
}

// -----------------------------------------------------------------------
// Discover
// -----------------------------------------------------------------------

function DiscoverPage() {
  return <div className="z-in">
    <PageHeader title="Discover" subtitle="What should you investigate? Pick a lead, or ask your own question." tag="AGENT"/>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DISCOVER_PROMPTS.map(({ label, question, icon: PromptIcon }) => <Link data-testid={`card-discover-${label.toLowerCase().replace(/\s+/g, "-")}`} key={label} href={`/ai?q=${encodeURIComponent(question)}`} className="panel group flex flex-col gap-3 rounded-xl p-5 transition-colors hover:border-blue-500/40">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-400"><PromptIcon size={18}/></div>
        <div><div className="text-sm font-medium text-slate-200">{label}</div><div className="mt-1.5 text-xs leading-relaxed text-slate-500">{question}</div></div>
        <div className="mt-auto flex items-center gap-1 text-[11px] text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">Investigate <ChevronRight size={12}/></div>
      </Link>)}
    </div>
    <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-600"><ShieldCheck size={13}/>Zenthra decides which tools and data sources a question needs — you don't need a wallet or token address to start.</div>
  </div>;
}

// -----------------------------------------------------------------------
// Futures — deep-dive research view for one pair, full Confluence Score
// -----------------------------------------------------------------------

function ConfluenceBar({ category }: { category: ConfluenceCategory }) {
  const pct = category.weight > 0 ? Math.round((category.raw / category.weight) * 100) : 0;
  return <div>
    <div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-slate-400">{category.label}</span><span className={`font-data ${category.available ? "text-slate-300" : "text-slate-600"}`}>{category.available ? `${category.raw}/${category.weight}` : "unavailable"}</span></div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${category.available ? "bg-blue-500" : "bg-slate-700"}`} style={{ width: `${category.available ? pct : 100}%`, opacity: category.available ? 1 : 0.3 }}/></div>
    <p className="mt-1 text-[10px] leading-snug text-slate-600">{category.note}</p>
  </div>;
}

function FuturesPage() {
  const search = useSearch();
  const requested = new URLSearchParams(search).get("symbol");
  const [symbol, setSymbol] = useState(requested && FUTURES_UNIVERSE.includes(requested) ? requested : FUTURES_UNIVERSE[0]);
  const { data, isLoading, isError, refetch } = useGetSignals({ symbol }, { query: { queryKey: getGetSignalsQueryKey({ symbol }) } });
  const signal = data?.[0] ?? null;

  return <div className="z-in">
    <PageHeader title="Futures Intelligence" subtitle="Research, not trade execution — a deterministic Confluence Score across market structure, momentum, and derivatives context." tag="ZENTHRA ENGINE"/>
    <div className="mb-5 flex flex-wrap gap-1.5">{FUTURES_UNIVERSE.map((s) => <button data-testid={`button-futures-${s}`} key={s} onClick={() => setSymbol(s)} className={`rounded-full border px-3 py-1.5 font-data text-[11px] transition-colors ${symbol === s ? "border-blue-500/60 bg-blue-500/10 text-blue-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}>{s.replace("USDT", "")}</button>)}</div>
    <QueryState loading={isLoading} error={isError} retry={() => void refetch()}/>
    {signal && <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="panel rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between"><span className="font-data text-sm text-slate-300">{signal.pair}</span><Badge tone={tierTone(signal.tier)}>{signal.tierLabel}</Badge></div>
        <div className="mb-4 flex items-end gap-3"><span className="font-display text-3xl font-semibold text-slate-100">{signal.call === "LONG" || signal.call === "SHORT" ? signal.call : signal.call === "WATCH" ? "WATCH" : "NO TRADE"}</span><span className="mb-1 font-data text-xs text-slate-500">{signal.score}/100 confluence</span></div>
        {signal.entry != null ? <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-900/60 p-2"><div className="text-slate-600">Entry</div><div className="mt-1 font-data text-slate-200">{signal.entry}</div></div>
          <div className="rounded-lg bg-slate-900/60 p-2"><div className="text-slate-600">Stop</div><div className="mt-1 font-data text-rose-300">{signal.stopLoss}</div></div>
          <div className="rounded-lg bg-slate-900/60 p-2"><div className="text-slate-600">Target</div><div className="mt-1 font-data text-emerald-300">{signal.takeProfit}</div></div>
        </div> : <p className="text-xs text-slate-600">No entry/stop/target — {signal.call === "NO_TRADE" ? "confluence is too thin for a trade idea right now." : "conditions don't support a directional call right now."}</p>}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{signal.reasoning}</p>
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-600"><ShieldCheck size={13}/>A classification, not a probability. Validate independently before acting.</p>
      </div>
      <div className="panel space-y-4 rounded-xl p-5"><h2 className="text-xs uppercase tracking-[.12em] text-slate-500">Confluence breakdown</h2>{signal.confluence.map((c) => <ConfluenceBar key={c.key} category={c}/>)}</div>
    </div>}
  </div>;
}

// -----------------------------------------------------------------------
// Signals — compact desk view across the whole watchlist
// -----------------------------------------------------------------------

function SignalPage() {
  const { data, isLoading, isError, refetch } = useGetSignals(undefined, { query: { queryKey: getGetSignalsQueryKey() } });
  const signals = data;
  const [, setLocation] = useLocation();
  return <div className="z-in"><PageHeader title="Signal desk" subtitle="Every tracked futures pair, one Confluence Score each. Not financial advice." tag="ZENTHRA ENGINE"/><QueryState loading={isLoading} error={isError} retry={() => void refetch()}/>{!isLoading && !isError && (signals?.length ? <DataTable head={["Pair", "Call", "Tier", "Score", "Entry", "Stop", "Target"]} rows={signals.map((s) => <Row key={s.pair} onClick={() => setLocation(`/futures?symbol=${s.pair}`)}><Cell className="font-medium text-slate-100">{s.pair}</Cell><Cell><Badge tone={s.call === "LONG" ? "green" : s.call === "SHORT" ? "red" : s.call === "WATCH" ? "amber" : "slate"}>{s.call}</Badge></Cell><Cell className="text-slate-400">{s.tierLabel}</Cell><Cell><div className="flex items-center gap-2"><div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${s.score}%` }}/></div><span className="font-data text-xs text-slate-400">{s.score}</span></div></Cell><Cell className="font-data text-slate-400">{s.entry ?? "—"}</Cell><Cell className="font-data text-rose-300">{s.stopLoss ?? "—"}</Cell><Cell className="font-data text-emerald-300">{s.takeProfit ?? "—"}</Cell></Row>)}/> : <Unavailable message="No pairs cleared the confluence threshold right now."/>)}<p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-600"><ShieldCheck size={13}/>Click a row to open the full Futures research view.</p></div>;
}

// -----------------------------------------------------------------------
// Markets / Token
// -----------------------------------------------------------------------

function MarketsPage() {
  const [filter, setFilter] = useState("");
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, refetch } = useGetMarkets({ query: { queryKey: getGetMarketsQueryKey() } });
  const markets = (data ?? []).filter((m) => `${m.name}${m.symbol}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="z-in"><PageHeader title="Markets" subtitle="Live price, volume and market cap across the tracked universe." tag="via CoinGecko" action={<div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2"><Search size={14} className="text-slate-600"/><input data-testid="input-market-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter assets" className="w-28 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600 sm:w-40"/></div>}/><QueryState loading={isLoading} error={isError} retry={() => void refetch()}/>{!isLoading && !isError && (markets.length ? <DataTable head={["#", "Asset", "Price", "24h", "Volume", "Market cap"]} rows={markets.map((m) => <Row key={m.symbol} onClick={() => setLocation(`/token/${m.symbol}`)}><Cell className="font-data text-slate-600">{m.rank}</Cell><Cell><div className="flex items-center gap-2.5"><div className="grid h-7 w-7 place-items-center rounded-md bg-slate-800 font-data text-[9px] text-blue-400">{m.symbol.slice(0, 3)}</div><div><span className="text-slate-200">{m.name}</span><span className="ml-2 font-data text-[10px] text-slate-600">{m.symbol}</span></div></div></Cell><Cell className="font-data text-slate-200">${<Format value={m.price}/>}</Cell><Cell className={`font-data ${m.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{m.change24h >= 0 ? "+" : ""}{m.change24h}%</Cell><Cell className="font-data text-slate-400">${<Format compact value={m.volume24h}/>}</Cell><Cell className="font-data text-slate-400">${<Format compact value={m.marketCap}/>}</Cell></Row>)}/> : <div className="panel rounded-xl p-8 text-center text-sm text-slate-500">No assets match <span className="font-data text-slate-300">{filter}</span>.</div>)}</div>;
}

function TokenPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["zenthra-token", symbol], queryFn: () => customFetch<TokenDetail>(`/api/token/${symbol}`), enabled: Boolean(symbol) });
  return <div className="z-in">
    <PageHeader title={symbol || "Token"} subtitle="Network asset profile and market structure." tag="via CoinGecko"/>
    <QueryState loading={isLoading} error={isError} retry={() => void refetch()}/>
    {data && <>
      <div className="mb-4 flex flex-wrap items-end gap-3"><span className="font-display text-4xl font-semibold tracking-[-.05em] text-slate-100">${<Format value={data.price}/>}</span><span className={`mb-1 text-sm ${data.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{data.change24h >= 0 ? "+" : ""}{data.change24h}% <span className="text-slate-600">24h</span></span></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4"><StatCard icon={BarChart3} label="Market cap" value={`$${formatCompact(data.marketCap)}`}/><StatCard icon={Activity} label="Volume 24h" value={`$${formatCompact(data.volume24h)}`}/><StatCard icon={Coins} label="Circ. supply" value={data.supply != null ? String(data.supply) : "Not available"}/><StatCard icon={User} label="Holders" value={data.holders != null ? String(data.holders) : "Not available"}/></div>
      {data.similarTokens?.length > 0 && <div><h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Also tracked</h2><div className="flex flex-wrap gap-2">{data.similarTokens.map((t) => <Link key={t.symbol} href={`/token/${t.symbol}`} className="rounded-full border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:border-blue-500/40 hover:text-blue-300">{t.symbol}</Link>)}</div></div>}
    </>}
  </div>;
}

// -----------------------------------------------------------------------
// On-chain / Wallets / Entities / Smart Money — honest about what's real
// -----------------------------------------------------------------------

function OnChainPage() {
  const { data: transfers, isLoading: loadingT } = useQuery({ queryKey: ["zenthra-onchain-transfers"], queryFn: () => customFetch<DegradedFeed<"transfers"> | { transfers: unknown[] }>("/api/onchain/transfers") });
  const { data: entities, isLoading: loadingE } = useQuery({ queryKey: ["zenthra-onchain-entities"], queryFn: () => customFetch<DegradedFeed<"entities"> | { entities: unknown[] }>("/api/onchain/entities") });
  return <div className="z-in"><PageHeader title="On-chain data" subtitle="Cross-chain activity overview and high-value event flow." tag="via Helius"/>
    {loadingT || loadingE ? <Skeleton className="h-32 w-full"/> : <div className="grid gap-4 md:grid-cols-2">
      <div><h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Large transfers</h2><Unavailable message={(transfers as { message?: string })?.message ?? "Intelligence degraded — source unavailable."}/></div>
      <div><h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Labeled entities</h2><Unavailable message={(entities as { message?: string })?.message ?? "Intelligence degraded — source unavailable."}/></div>
    </div>}
  </div>;
}

function WalletPage() {
  const [address, setAddress] = useState("");
  const [queryAddress, setQueryAddress] = useState("");
  const { data, isLoading, isError, refetch } = useGetWallet(queryAddress, { query: { enabled: Boolean(queryAddress), queryKey: getGetWalletQueryKey(queryAddress) } });
  const wallet: WalletAnalysis | undefined = data;
  return <div className="z-in"><PageHeader title="Wallet analysis" subtitle="Search a Solana address to map holdings." tag="via Helius"/><form onSubmit={(e) => { e.preventDefault(); setQueryAddress(address.trim()); }} className="mb-5 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 focus-within:border-blue-500/40"><Search size={16} className="text-slate-600"/><input data-testid="input-wallet-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Paste a Solana wallet address" className="min-w-0 flex-1 bg-transparent font-data text-xs text-slate-300 outline-none placeholder:text-slate-600" aria-label="Wallet address"/><button data-testid="button-analyze-wallet" className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400">Analyze</button></form>
    <QueryState loading={isLoading} error={isError} retry={() => void refetch()}/>
    {!queryAddress && !isLoading && <Unavailable message="Enter a wallet address above to pull its live SOL balance and token holdings."/>}
    {wallet && (wallet.error ? <Unavailable message={wallet.error}/> : <>
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Balance</span><span className="font-data text-sm text-slate-100">{wallet.solBalance} SOL</span><span className="ml-auto font-data text-[10px] text-slate-600">{wallet.address.slice(0, 10)}...{wallet.address.slice(-6)}</span></div>
      <h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Holdings · {wallet.tokenCount}</h2>
      <div className="space-y-1.5">{wallet.tokens.map((token, i) => <div data-testid={`row-wallet-token-${token.symbol}`} key={`${token.symbol}-${i}`} className="panel flex items-center justify-between rounded-lg px-3 py-3"><span className="text-sm text-slate-300">{token.name} <span className="ml-1 font-data text-[10px] text-slate-600">{token.symbol}</span></span><span className="font-data text-xs text-slate-400">{token.amount != null ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(token.amount) : "—"}</span></div>)}</div>
    </>)}
  </div>;
}

function EntitiesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["zenthra-onchain-entities"], queryFn: () => customFetch<DegradedFeed<"entities"> | { entities: unknown[] }>("/api/onchain/entities") });
  return <div className="z-in"><PageHeader title="Entities" subtitle="Labeled wallets and organizations in the intelligence graph." tag="ROADMAP"/>{isLoading ? <Skeleton className="h-32 w-full"/> : <Unavailable message={(data as { message?: string })?.message ?? "A verified entity-labeling directory isn't connected yet."}/>}</div>;
}

function SmartMoneyPage() {
  return <div className="z-in"><PageHeader title="Smart money" subtitle="Top-performing wallets ranked by recent conviction and realized edge." tag="ROADMAP"/><Unavailable message="Intelligence degraded — source unavailable. A wallet-performance leaderboard needs an aggregate PnL-tracking feed this build doesn't have yet."/></div>;
}

// -----------------------------------------------------------------------
// Monitor — real watchlist + real alerts (folds the old separate pages
// into the one surface the Blueprint's sidebar actually lists)
// -----------------------------------------------------------------------

function MonitorPage() {
  const qc = useQueryClient();
  const { data: watchlist, isLoading: loadingW, dataUpdatedAt, refetch: refetchW } = useWatchlist();
  const { data: alerts, isLoading: loadingA, refetch: refetchA } = useAlerts();
  const [newItem, setNewItem] = useState("");
  const [newAlert, setNewAlert] = useState("");

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    const value = newItem.trim();
    if (!value) return;
    await customFetch("/api/watchlist", { method: "POST", body: JSON.stringify({ kind: "token", value: value.toUpperCase() }) });
    setNewItem("");
    void qc.invalidateQueries({ queryKey: ["zenthra-watchlist"] });
  };
  const removeItem = async (id: string) => { await customFetch(`/api/watchlist/${id}`, { method: "DELETE" }); void qc.invalidateQueries({ queryKey: ["zenthra-watchlist"] }); };
  const addAlert = async (e: FormEvent) => {
    e.preventDefault();
    const condition = newAlert.trim();
    if (!condition) return;
    await customFetch("/api/alerts", { method: "POST", body: JSON.stringify({ kind: "price", target: "custom", condition }) });
    setNewAlert("");
    void qc.invalidateQueries({ queryKey: ["zenthra-alerts"] });
  };
  const toggleAlert = async (a: AlertItem) => { await customFetch(`/api/alerts/${a.id}`, { method: "PUT", body: JSON.stringify({ active: !a.active }) }); void qc.invalidateQueries({ queryKey: ["zenthra-alerts"] }); };
  const deleteAlert = async (id: string) => { await customFetch(`/api/alerts/${id}`, { method: "DELETE" }); void qc.invalidateQueries({ queryKey: ["zenthra-alerts"] }); };

  return <div className="z-in">
    <PageHeader title="Monitor" subtitle="Tracked items and alert conditions — refresh to check for changes." action={<button data-testid="button-refresh-monitor" onClick={() => { void refetchW(); void refetchA(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-blue-500/40"><RefreshCw size={14}/>Check now</button>}/>
    <p className="mb-5 text-[11px] text-slate-600">Last checked {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}. This checks on demand — it doesn't push notifications on its own yet.</p>
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Tracked</h2>
        <form onSubmit={addItem} className="mb-3 flex gap-2"><input data-testid="input-add-watchlist" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Token symbol, e.g. SOL" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 font-data text-xs text-slate-200 outline-none focus:border-blue-500/40 placeholder:text-slate-600"/><button className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-400"><Plus size={14}/></button></form>
        {loadingW ? <Skeleton className="h-24 w-full"/> : (watchlist?.length ? <div className="space-y-1.5">{watchlist.map((w) => <div key={w.id} className="panel flex items-center gap-3 rounded-lg px-3 py-2.5"><span className="font-data text-sm text-slate-200">{w.value}</span><span className="text-[10px] uppercase text-slate-600">{w.kind}</span><button onClick={() => void removeItem(w.id)} className="ml-auto text-slate-600 hover:text-rose-300" aria-label={`Remove ${w.value}`}><X size={14}/></button></div>)}</div> : <Unavailable message="Nothing tracked yet — add a token above."/>)}
      </section>
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Alerts</h2>
        <form onSubmit={addAlert} className="mb-3 flex gap-2"><input data-testid="input-add-alert" value={newAlert} onChange={(e) => setNewAlert(e.target.value)} placeholder="e.g. SOL price above 220" className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500/40 placeholder:text-slate-600"/><button className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-400"><Plus size={14}/></button></form>
        {loadingA ? <Skeleton className="h-24 w-full"/> : (alerts?.length ? <div className="space-y-1.5">{alerts.map((a) => <div key={a.id} className="panel flex items-center gap-3 rounded-lg px-3 py-2.5"><span className="text-sm text-slate-300">{a.condition}</span><button onClick={() => void toggleAlert(a)}><Badge tone={a.active ? "green" : "slate"}>{a.active ? "Active" : "Paused"}</Badge></button><button onClick={() => void deleteAlert(a.id)} className="text-slate-600 hover:text-rose-300" aria-label="Delete alert"><X size={14}/></button></div>)}</div> : <Unavailable message="No alert conditions yet — add one above."/>)}
      </section>
    </div>
  </div>;
}

// -----------------------------------------------------------------------
// AI Research — the core product
// -----------------------------------------------------------------------

const RESEARCH_STAGES = ["Understanding your question…", "Gathering market and on-chain data…", "Cross-checking sources…", "Composing the answer…"];
function ResearchIndicator() {
  const [stage, setStage] = useState(0);
  useEffect(() => { const t = setInterval(() => setStage((s) => Math.min(s + 1, RESEARCH_STAGES.length - 1)), 1400); return () => clearInterval(t); }, []);
  return <div className="flex items-center gap-3"><ZLogo size={20}/><span className="text-xs text-slate-500">{RESEARCH_STAGES[stage]}</span><div className="relative h-px w-28 overflow-hidden bg-slate-800"><div className="scan-line absolute inset-y-0 left-0 w-1/2 bg-blue-500"/></div></div>;
}

function AiResearchPage() {
  const sendChat = useSendChat();
  const search = useSearch();
  const prefilled = useRef(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [reaction, setReaction] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showAttach, setShowAttach] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, thinking]);

  const submit = async (value = input) => {
    const text = value.trim();
    if (!text || thinking) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setAttachments([]);
    setThinking(true);
    try {
      const result = await sendChat.mutateAsync({ data: { message: text, history: next } });
      setMessages((m) => [...m, { role: "assistant", text: result.reply }]);
    } catch {
      // Honest failure state — never a scripted fake analysis. See the
      // Master Blueprint: "Do not use hardcoded fake AI responses as the
      // production fallback."
      setMessages((m) => [...m, { role: "assistant", text: "Zenthra's research engine is temporarily unavailable. Please try again in a moment." }]);
    } finally { setThinking(false); }
  };

  useEffect(() => {
    if (prefilled.current) return;
    const params = new URLSearchParams(search);
    const q = params.get("q");
    if (q) { prefilled.current = true; void submit(q); }
  }, [search]);

  const copyMessage = (i: number, text: string) => { void navigator.clipboard?.writeText(text); setCopied(i); window.setTimeout(() => setCopied(null), 1200); };
  const chooseFile = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) setAttachments((v) => [...v, file.name]); setShowAttach(false); e.target.value = ""; };

  return <div className="flex h-full min-h-0 flex-col">
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex min-h-full w-full max-w-3xl flex-col ${messages.length ? "justify-start pt-6" : "justify-center"} px-4 pb-6 sm:px-8`}>
        {messages.length === 0 ? <div className="relative text-center">
          <div className="soft-pulse absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl"/>
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-blue-500/30 bg-blue-500/5"><ZLogo size={38}/></div>
          <h1 className="relative mt-6 font-display text-3xl font-semibold tracking-[-.04em] text-slate-100">Ask a question. Zenthra does the research.</h1>
          <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">You don't need a wallet or token address to start — just ask.</p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-2">{DISCOVER_PROMPTS.slice(0, 3).map(({ label, question, icon: SuggestionIcon }) => <button data-testid={`button-suggestion-${label.toLowerCase().replace(/\s+/g, "-")}`} key={label} onClick={() => void submit(question)} className="inline-flex items-center gap-2 rounded-full border border-slate-800 px-3.5 py-2 text-xs text-slate-300 transition-all hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-slate-900"><SuggestionIcon size={14} className="text-blue-400"/>{label}</button>)}</div>
        </div> : <div className="space-y-7">
          {messages.map((m, i) => <div data-testid={`message-${i}`} key={i} className={`z-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? <div className="group max-w-[85%]"><div className="rounded-2xl rounded-br-sm border border-blue-500/20 bg-blue-500/[.08] px-4 py-3 text-sm leading-relaxed text-slate-100">{m.text}</div><button data-testid={`button-copy-user-${i}`} onClick={() => copyMessage(i, m.text)} className="mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-700 opacity-0 transition-opacity group-hover:opacity-100"><Copy size={11}/>{copied === i ? "Copied" : "Copy"}</button></div>
              : <div className="flex max-w-[90%] gap-3"><div className="mt-0.5"><ZLogo size={20}/></div><div><p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{m.text}</p><div className="mt-2 flex items-center gap-1">
                <button data-testid={`button-copy-assistant-${i}`} onClick={() => copyMessage(i, m.text)} className="rounded-md p-1.5 text-slate-700 hover:bg-slate-800 hover:text-slate-300"><Copy size={13}/></button>
                <button data-testid={`button-like-assistant-${i}`} onClick={() => setReaction((v) => ({ ...v, [i]: v[i] === "up" ? "" : "up" }))} className={`rounded-md p-1.5 ${reaction[i] === "up" ? "bg-blue-500/10 text-blue-400" : "text-slate-700 hover:text-slate-300"}`}><ThumbsUp size={13}/></button>
                <button data-testid={`button-dislike-assistant-${i}`} onClick={() => setReaction((v) => ({ ...v, [i]: v[i] === "down" ? "" : "down" }))} className={`rounded-md p-1.5 ${reaction[i] === "down" ? "bg-rose-300/10 text-rose-300" : "text-slate-700 hover:text-slate-300"}`}><ThumbsDown size={13}/></button>
                <button data-testid={`button-regenerate-assistant-${i}`} onClick={() => void submit(messages[i - 1]?.text || "")} className="rounded-md p-1.5 text-slate-700 hover:text-slate-300"><RotateCcw size={13}/></button>
                {copied === i && <span className="ml-1 text-[10px] text-slate-600">Copied</span>}
              </div></div></div>}
          </div>)}
          {thinking && <ResearchIndicator/>}
        </div>}
      </div>
    </div>
    <div className="border-t border-slate-800/80 p-3 sm:p-5"><div className="mx-auto max-w-3xl">
      {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{attachments.map((name, i) => <span key={`${name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[10px] text-slate-300"><Paperclip size={11} className="text-blue-400"/>{name.slice(0, 20)}<button data-testid={`button-remove-attachment-${i}`} onClick={() => setAttachments((v) => v.filter((_, j) => j !== i))} aria-label="Remove attachment"><X size={11}/></button></span>)}</div>}
      <div className="relative flex items-end gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/80 px-2 py-2 transition-colors focus-within:border-blue-500/50">
        <div className="relative"><button data-testid="button-chat-attach" onClick={() => setShowAttach(!showAttach)} className={`grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-800 hover:text-blue-400 ${showAttach ? "rotate-45" : ""}`} aria-label="Add attachment"><Plus size={18}/></button>{showAttach && <div className="absolute bottom-full left-0 z-10 mb-2 w-40 rounded-xl border border-slate-800 bg-slate-900 py-1.5 shadow-2xl"><button data-testid="button-upload-camera" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Camera size={14} className="text-blue-400"/>Camera or photo</button><button data-testid="button-upload-file" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><Paperclip size={14} className="text-blue-400"/>Attach file</button></div>}</div>
        <input ref={fileRef} onChange={chooseFile} type="file" className="hidden" data-testid="input-chat-file"/>
        <textarea data-testid="input-chat-message" rows={1} value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder="Ask anything about the on-chain world..." className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-600"/>
        <button data-testid="button-chat-mic" className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-800 hover:text-blue-400" aria-label="Voice input" disabled title="Voice input isn't available yet"><Mic size={16}/></button>
        <button data-testid="button-send-chat" onClick={() => void submit()} disabled={!input.trim() || thinking} className="grid h-8 w-8 place-items-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500" aria-label="Send message"><Send size={15}/></button>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-700">Zenthra can make mistakes. Verify research before acting on it.</p>
    </div></div>
  </div>;
}

// -----------------------------------------------------------------------
// API docs / Account / Theme — kept, but no longer in the primary nav
// (see the Blueprint's exact sidebar spec). Account's old two-factor
// toggle was purely decorative (no backend behind it) — replaced with an
// honest label instead of a switch that silently did nothing.
// -----------------------------------------------------------------------

function ApiDocsPage() {
  const [copiedReq, setCopiedReq] = useState(false);
  const endpoints = [["GET", "/api/markets", "Live price, volume, and market cap per tracked token"], ["GET", "/api/signals", "Confluence Score across tracked futures pairs (optional ?symbol=)"], ["GET", "/api/wallet/:address", "Balance and holdings for a Solana wallet"], ["GET", "/api/token/:symbol", "Token detail for one tracked asset"], ["POST", "/api/chat", "The AI research agent"], ["GET", "/api/watchlist", "Your tracked items"], ["GET", "/api/alerts", "Your alert conditions"]];
  const copyRequest = () => { void navigator.clipboard?.writeText("curl /api/markets"); setCopiedReq(true); window.setTimeout(() => setCopiedReq(false), 1400); };
  return <div className="z-in"><PageHeader title="API docs" subtitle="Endpoints powering the Zenthra intelligence surface."/><div className="mb-5 panel rounded-xl bg-blue-500/[.03] p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-400"><FileCode2 size={17}/></div><div><h2 className="text-sm font-medium text-slate-200">Build with the signal layer</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Use the same normalized market and on-chain context in your own research tools.</p><button data-testid="button-copy-api-key" onClick={copyRequest} className="mt-3 inline-flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"><Copy size={13}/> {copiedReq ? "Copied request" : "Copy starter request"}</button></div></div></div><div className="space-y-2">{endpoints.map((e, i) => <div data-testid={`card-api-endpoint-${i}`} key={i} className="panel flex flex-wrap items-start gap-3 rounded-xl px-4 py-3.5"><Badge tone={e[0] === "GET" ? "blue" : "green"}>{e[0]}</Badge><div><div className="font-data text-sm text-slate-200">{e[1]}</div><div className="mt-1 text-xs text-slate-600">{e[2]}</div></div><ExternalLink size={14} className="ml-auto text-slate-700"/></div>)}</div></div>;
}
function AccountPage() {
  const signOut = () => { localStorage.removeItem("zenthra_token"); window.dispatchEvent(new Event("zenthra-auth")); };
  return <div className="z-in"><PageHeader title="Account" subtitle="Workspace identity and access controls."/><div className="mb-6 flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-full border border-blue-500/20 bg-blue-500/5"><ZLogo size={28}/></div><div><div className="text-sm font-medium text-slate-100">Zenthra User</div><Badge tone="blue">Authenticated</Badge></div></div><div className="max-w-xl space-y-2"><div className="panel flex items-center justify-between rounded-xl p-4"><div className="flex items-center gap-2 text-sm text-slate-300"><KeyRound size={15} className="text-slate-500"/> Session security</div><span className="font-data text-xs text-emerald-300">JWT active</span></div><div className="panel flex items-center justify-between rounded-xl p-4"><div className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck size={15} className="text-slate-500"/> Two-factor authentication</div><span className="text-xs text-slate-600">Not available yet</span></div><button data-testid="button-sign-out" onClick={signOut} className="mt-3 flex items-center gap-2 px-1 py-2 text-xs text-rose-300 hover:text-rose-200"><LogOut size={14}/> Sign out</button></div></div>;
}
function ThemePage() {
  const [dense, setDense] = useState(true);
  return <div className="z-in"><PageHeader title="Theme" subtitle="Tune the workspace for long research sessions."/><div className="mb-5 flex gap-3"><button data-testid="button-theme-dark" className="w-36 rounded-xl border-2 border-blue-500/70 bg-slate-950 p-3 text-left"><div className="mb-2 h-16 rounded-lg border border-slate-800 bg-[#05070A]"><div className="m-2 h-1.5 w-10 rounded-full bg-blue-500/70"/><div className="m-2 h-1.5 w-16 rounded-full bg-slate-700"/></div><div className="text-xs text-slate-200">Obsidian</div><div className="mt-1 text-[10px] text-blue-400">Current</div></button><button data-testid="button-theme-light-disabled" disabled className="w-36 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-left opacity-40"><div className="mb-2 h-16 rounded-lg border border-slate-700 bg-slate-200"/><div className="text-xs text-slate-300">Daylight</div><div className="mt-1 text-[10px] text-slate-600">Coming later</div></button></div><div className="panel flex max-w-md items-center justify-between rounded-xl p-4"><div><div className="text-sm text-slate-200">Dense data mode</div><div className="mt-1 text-xs text-slate-600">Tighter rows for scanning more context.</div></div><button data-testid="button-toggle-dense-mode" onClick={() => setDense(!dense)} className={`relative h-6 w-11 rounded-full transition-colors ${dense ? "bg-blue-500" : "bg-slate-700"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-slate-950 transition-transform ${dense ? "translate-x-6" : "translate-x-1"}`}/><span className="sr-only">Toggle dense mode</span></button></div></div>;
}

// -----------------------------------------------------------------------
// Shell — sidebar, auth, routing
// -----------------------------------------------------------------------

function Sidebar({ open, close, newChat }: { open: boolean; close: () => void; newChat: () => void }) {
  const [location] = useLocation();
  const current = location.split("/")[1] || "home";
  const { data: history } = useQuery({ queryKey: ["zenthra-history"], queryFn: () => customFetch<{ id: string; title: string }[]>("/api/history") });
  return <><aside className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-slate-800/80 bg-[hsl(var(--sidebar))] transition-transform duration-200 md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-5"><Link data-testid="link-brand-home" href="/" className="flex items-center gap-2.5"><ZLogo size={24}/><span className="font-display text-[17px] font-semibold tracking-[-.03em] text-slate-100">Zenthra</span><span className="rounded border border-blue-500/20 px-1 py-0.5 font-data text-[8px] text-blue-400">BETA</span></Link><button data-testid="button-close-sidebar" onClick={close} className="text-slate-600 hover:text-slate-300 md:hidden" aria-label="Close navigation"><X size={18}/></button></div>
    <div className="p-3"><button data-testid="button-new-chat" onClick={newChat} className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2.5 text-xs text-slate-300 transition-colors hover:border-blue-500/40 hover:bg-blue-500/5"><Plus size={15} className="text-blue-400"/>New Research</button></div>
    <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">{navGroups.map((group) => <div className="mb-4" key={group.label}><div className="mb-1 px-2.5 text-[10px] uppercase tracking-[.15em] text-slate-700">{group.label}</div><div className="space-y-0.5">{group.items.map(([key, label, NavIcon]) => { const active = current === key; const N = NavIcon as Icon; return <Link data-testid={`link-nav-${key}`} key={key} href={`/${key}`} onClick={close} className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${active ? "border-l-2 border-blue-500 bg-blue-500/[.08] pl-2 text-blue-300" : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-200"}`}><N size={15}/><span className="flex-1">{label}</span>{active && <span className="h-1 w-1 rounded-full bg-blue-500"/>}</Link>; })}</div>{group.label === "Core" && history && history.length > 0 && <div className="mt-4"><div className="mb-1 px-2.5 text-[10px] uppercase tracking-[.15em] text-slate-700">Recent</div>{history.slice(0, 5).map((h) => <Link data-testid={`link-history-${h.id}`} key={h.id} href="/ai" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-600 hover:bg-slate-800/50 hover:text-slate-300"><MessageSquare size={13}/><span className="truncate font-data">{h.title}</span></Link>)}</div>}</div>)}</nav>
    <div className="flex items-center gap-2 border-t border-slate-800/80 px-4 py-3 text-[10px] text-slate-700"><span>On-chain intelligence</span><span className="ml-auto font-data">v0.1</span></div>
  </aside>{open && <button data-testid="button-sidebar-overlay" onClick={close} className="fixed inset-0 z-30 bg-slate-950/70 md:hidden" aria-label="Close navigation overlay"/>}</>;
}

function AuthPage({ onAuthed }: { onAuthed: () => void }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (registering && password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { token?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error ?? "Authentication failed.");
      localStorage.setItem("zenthra_token", data.token);
      window.dispatchEvent(new Event("zenthra-auth"));
      onAuthed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Authentication failed."); }
    finally { setBusy(false); }
  };
  return <div className="noise flex min-h-[100dvh] items-center justify-center bg-background px-4 text-foreground">
    <div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3"><ZLogo size={34}/><div><div className="font-display text-xl font-semibold tracking-tight text-slate-100">Zenthra</div><div className="font-data text-[10px] uppercase tracking-[.18em] text-blue-400">Intelligence for the on-chain world</div></div></div>
      <div className="panel rounded-2xl p-6 sm:p-8">
        <div className="mb-6"><div className="mb-2 inline-flex rounded-full border border-blue-500/20 bg-blue-500/[.06] px-2.5 py-1 font-data text-[10px] text-blue-300">RESEARCH WORKSPACE</div><h1 className="font-display text-2xl font-semibold text-slate-100">{registering ? "Create your workspace" : "Welcome back"}</h1><p className="mt-2 text-sm leading-relaxed text-slate-500">{registering ? "Save your research, alerts, and conversations in one place." : "Sign in to continue your research."}</p></div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs text-slate-400">Email<input data-testid="input-auth-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-blue-500/60" placeholder="you@example.com"/></label>
          <label className="block text-xs text-slate-400">Password<input data-testid="input-auth-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} autoComplete={registering ? "new-password" : "current-password"} required className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-blue-500/60" placeholder="At least 8 characters"/></label>
          {registering && <label className="block text-xs text-slate-400">Confirm password<input data-testid="input-auth-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" minLength={8} autoComplete="new-password" required className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-blue-500/60"/></label>}
          {error && <div className="rounded-lg border border-rose-300/20 bg-rose-300/[.05] px-3 py-2.5 text-xs text-rose-200">{error}</div>}
          <button data-testid="button-auth-submit" disabled={busy} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60">{busy ? "Connecting..." : registering ? "Create account" : "Sign in"}<ArrowUpRight size={15}/></button>
        </form>
        <button data-testid="button-auth-toggle" onClick={() => { setRegistering(!registering); setError(""); }} className="mt-5 w-full text-center text-xs text-slate-500 hover:text-blue-300">{registering ? "Already have an account? Sign in" : "New to Zenthra? Create an account"}</button>
      </div>
      <p className="mt-5 text-center text-[11px] text-slate-700">Real data. Real research.</p>
    </div>
  </div>;
}

function AuthGate() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem("zenthra_token")));
  const [location] = useLocation();
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("zenthra_token"));
    const onAuth = () => setAuthenticated(Boolean(localStorage.getItem("zenthra_token")));
    window.addEventListener("zenthra-auth", onAuth);
    return () => { window.removeEventListener("zenthra-auth", onAuth); setAuthTokenGetter(null); };
  }, []);
  if (!authenticated) return <AuthPage onAuthed={() => setAuthenticated(true)}/>;
  // Admin renders full-page, deliberately outside Shell/Sidebar — it isn't
  // a tab inside the public product, it's a separate internal surface that
  // happens to share the login. No nav item links here (see navGroups).
  if (location === "/admin") return <AdminPage/>;
  return <Shell/>;
}

function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, setLocation] = useLocation();
  const [chatReset, setChatReset] = useState(0);
  const { data: health } = useHealthCheck();
  return <div className="noise flex min-h-[100dvh] w-full overflow-hidden bg-background text-foreground"><Sidebar open={sidebarOpen} close={() => setSidebarOpen(false)} newChat={() => { setChatReset((n) => n + 1); setLocation("/ai"); setSidebarOpen(false); }}/><main className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col"><div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-4 sm:px-6 md:px-8"><button data-testid="button-open-sidebar" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 md:hidden" aria-label="Open navigation"><Menu size={19}/></button><div className="hidden items-center gap-2 text-[11px] text-slate-600 md:flex"><div className="h-1.5 w-1.5 rounded-full bg-emerald-300"/><span>{health?.status === "ok" ? "All systems operational" : "Research workspace"}</span></div><div className="ml-auto flex items-center gap-2"><button data-testid="button-global-search" onClick={() => setLocation("/markets")} className="hidden items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-[11px] text-slate-600 hover:border-slate-600 sm:flex"><Search size={13}/>Search universe <span className="font-data text-[9px]">/</span></button><Link data-testid="link-header-account" href="/account" className="grid h-8 w-8 place-items-center rounded-full border border-blue-500/20 bg-blue-500/5 text-xs text-blue-300">ZU</Link></div></div><div key={chatReset} className="min-h-0 flex-1"><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/ai" component={AiResearchPage}/>
    <Route path="/discover" component={DiscoverPage}/>
    <Route path="/futures" component={FuturesPage}/>
    <Route path="/markets" component={MarketsPage}/>
    <Route path="/token/:symbol" component={TokenPage}/>
    <Route path="/onchain" component={OnChainPage}/>
    <Route path="/wallet" component={WalletPage}/>
    <Route path="/entities" component={EntitiesPage}/>
    <Route path="/smartmoney" component={SmartMoneyPage}/>
    <Route path="/signal" component={SignalPage}/>
    <Route path="/monitor" component={MonitorPage}/>
    <Route path="/pricing" component={PricingPage}/>
    <Route path="/apidocs" component={ApiDocsPage}/>
    <Route path="/account" component={AccountPage}/>
    <Route path="/theme" component={ThemePage}/>
    <Route component={NotFound}/>
  </Switch></div></main></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><RoutedErrorBoundary><AuthGate/></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>; }
export default App;
