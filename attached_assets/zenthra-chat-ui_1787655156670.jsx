import React, { useState, useRef, useEffect } from "react";
import {
  Plus, Menu, X, ArrowUp, MessageSquare, Wallet, Coins, Radar, Mic,
  Copy, RotateCcw, Home, TrendingUp, Database,
  Building2, ArrowLeftRight, Receipt, BarChart3, Star, Bell, Plug,
  FileCode, User, Palette, Activity, Sparkles, Search, ArrowDownLeft,
  ArrowUpRight, CheckCircle2, Clock, ShieldCheck, KeyRound, LogOut,
  ChevronRight, Gauge, Fingerprint, LayoutDashboard, ExternalLink,
  Camera, Image as ImageIcon, Paperclip, ThumbsUp, ThumbsDown,
} from "lucide-react";

/* ---------------- Mock data ---------------- */

const HISTORY = [
  { id: 1, title: "Whale wallet 7xKX...9pQ2" },
  { id: 2, title: "SOL/USDC liquidity check" },
  { id: 3, title: "New token risk scan" },
  { id: 4, title: "Smart money flow — BONK" },
];

const SUGGESTIONS = [
  { icon: Wallet, label: "Analyze a wallet" },
  { icon: Coins, label: "Check token risk" },
  { icon: Radar, label: "Track smart money" },
];

const DEMO_REPLIES = {
  wallet:
    "Wallet 7xKXtg2C...osgAsU holds 12.4 SOL (~$2,635) and 6 SPL tokens. Activity spiked 3h ago with a 40,000 USDC inbound transfer, followed by a swap into BONK. This wallet is currently flagged as smart money — its historical entries have matched profitable moves from 2 other tracked wallets.",
  signal:
    "SOL/USDT is showing a LONG bias on the 1h timeframe, scoring 84/100 on the ZENTHRA engine. Confluence: EMA9 crossed above EMA21, MACD histogram turning positive, ADX above 25 confirming trend strength, plus a bullish order block reclaim around 208. Suggested entry 212.5, stop 204.0, target 231.0. Risk/reward sits around 1:2.3.",
  market:
    "SOL is trading at $212.55, up 5.8% over 24h on $4.1B volume — outpacing BTC and ETH today. Market cap sits at $102B, ranking it #3. Momentum picked up after the JUP ecosystem volume spike this morning; worth watching $220 as the next resistance.",
  token:
    "JUP is at $1.08, up 7.9% in the last 24h with $210M volume. Circulating supply and recent unlock schedule look healthy relative to trading volume — no major dilution risk flagged this week. Holder concentration is moderate, nothing that trips smart-money alarms.",
  default:
    "I can pull live wallet balances, token prices, on-chain transfers, and ZENTHRA trading signals — just ask naturally. Try something like 'analyze wallet 7xKX...' or 'what's the signal on SOL right now?'",
};

function pickDemoReply(q) {
  const s = q.toLowerCase();
  if (s.includes("wallet") || /[1-9A-HJ-NP-Za-km-z]{28,44}/.test(q)) return DEMO_REPLIES.wallet;
  if (s.includes("signal") || s.includes("long") || s.includes("short") || s.includes("entry")) return DEMO_REPLIES.signal;
  if (s.includes("jup") || s.includes("token")) return DEMO_REPLIES.token;
  if (s.includes("market") || s.includes("price") || s.includes("sol") || s.includes("btc")) return DEMO_REPLIES.market;
  return DEMO_REPLIES.default;
}

const MARKETS = [
  { rank: 1, name: "Bitcoin", sym: "BTC", price: "$97,412", chg: 2.4, vol: "$38.2B", mcap: "$1.92T" },
  { rank: 2, name: "Ethereum", sym: "ETH", price: "$3,684", chg: -1.1, vol: "$16.7B", mcap: "$443B" },
  { rank: 3, name: "Solana", sym: "SOL", price: "$212.55", chg: 5.8, vol: "$4.1B", mcap: "$102B" },
  { rank: 4, name: "BNB", sym: "BNB", price: "$712.30", chg: 0.6, vol: "$1.4B", mcap: "$104B" },
  { rank: 5, name: "XRP", sym: "XRP", price: "$2.41", chg: -0.4, vol: "$2.9B", mcap: "$138B" },
  { rank: 6, name: "Dogecoin", sym: "DOGE", price: "$0.412", chg: 3.2, vol: "$980M", mcap: "$60B" },
  { rank: 7, name: "Jupiter", sym: "JUP", price: "$1.08", chg: 7.9, vol: "$210M", mcap: "$1.4B" },
  { rank: 8, name: "Bonk", sym: "BONK", price: "$0.0000341", chg: 12.6, vol: "$88M", mcap: "$2.1B" },
];

const TOKEN_DETAIL = {
  name: "Solana", sym: "SOL", price: "$212.55", chg: 5.8,
  mcap: "$102.4B", vol: "$4.1B", supply: "480.2M SOL", holders: "3.1M",
};

const ONCHAIN_STATS = { vol: "$6.8B", wallets: "412K", gas: "1.2 Gwei" };
const ONCHAIN_EVENTS = [
  { chain: "SOL", type: "Large Transfer", value: "$1.2M", time: "2m ago" },
  { chain: "ETH", type: "DEX Swap", value: "$860K", time: "6m ago" },
  { chain: "BASE", type: "Bridge In", value: "$410K", time: "11m ago" },
  { chain: "SOL", type: "NFT Mint Spike", value: "2,340 mints", time: "18m ago" },
  { chain: "ETH", type: "Large Transfer", value: "$2.4M", time: "23m ago" },
];

const WALLET_DEMO = {
  address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  balance: "12.4 SOL", usd: "$2,635",
  holdings: [
    { token: "SOL", amount: "12.4", value: "$2,635" },
    { token: "BONK", amount: "42.1M", value: "$1,436" },
    { token: "JUP", amount: "890", value: "$961" },
  ],
  activity: [
    { action: "Swap USDC → BONK", time: "3h ago" },
    { action: "Received 40,000 USDC", time: "3h ago" },
    { action: "Sent 5 SOL", time: "1d ago" },
  ],
  smartMoney: true,
};

const TRANSFERS = [
  { token: "USDC", amount: "40,000", from: "9fQm...2xRk", to: "7xKX...osgAsU", time: "3m ago", chain: "SOL" },
  { token: "ETH", amount: "12.5", from: "0x8a2...c91f", to: "0x22e...bb04", time: "7m ago", chain: "ETH" },
  { token: "BONK", amount: "18.2M", from: "7xKX...osgAsU", to: "3vLp...9k2Q", time: "9m ago", chain: "SOL" },
  { token: "USDT", amount: "120,000", from: "Binance 14", to: "0x91c...4de2", time: "15m ago", chain: "ETH" },
];

const TRANSACTIONS = [
  { hash: "5uHq...pT91", type: "Swap", value: "$1,436", status: "Success", time: "3m ago" },
  { hash: "0x7ac...3fe1", type: "Transfer", value: "$860K", status: "Success", time: "6m ago" },
  { hash: "2mLk...9xQ3", type: "Stake", value: "$4,200", status: "Pending", time: "10m ago" },
  { hash: "0xb41...aa02", type: "Contract Call", value: "$0", status: "Failed", time: "14m ago" },
];

const ENTITIES = [
  { name: "Binance Hot Wallet", type: "Exchange", address: "9fQm...2xRk", chain: "Multi" },
  { name: "Jump Trading", type: "Market Maker", address: "5vHn...8pL2", chain: "SOL" },
  { name: "Wintermute", type: "Market Maker", address: "0x000...a1b2", chain: "ETH" },
  { name: "Jito Foundation", type: "Protocol", address: "6kQp...4mN9", chain: "SOL" },
];

const SMART_MONEY = [
  { rank: 1, wallet: "7xKX...osgAsU", winRate: "78%", pnl: "+$142K", last: "12m ago" },
  { rank: 2, wallet: "3vLp...9k2Q", winRate: "71%", pnl: "+$96K", last: "34m ago" },
  { rank: 3, wallet: "9fQm...2xRk", winRate: "68%", pnl: "+$81K", last: "1h ago" },
  { rank: 4, wallet: "5vHn...8pL2", winRate: "65%", pnl: "+$54K", last: "2h ago" },
];

const SIGNALS = [
  { pair: "SOL/USDT", dir: "LONG", score: 84, entry: "212.5", sl: "204.0", tp: "231.0", tf: "1h" },
  { pair: "BTC/USDT", dir: "LONG", score: 76, entry: "97,400", sl: "95,100", tp: "101,800", tf: "4h" },
  { pair: "JUP/USDT", dir: "SHORT", score: 71, entry: "1.08", sl: "1.14", tp: "0.95", tf: "15m" },
  { pair: "BONK/USDT", dir: "LONG", score: 68, entry: "0.0000341", sl: "0.0000318", tp: "0.0000392", tf: "1h" },
];

const EXCHANGES = [
  { name: "Binance", vol: "$18.2B", pairs: 1420, trust: 9.8 },
  { name: "OKX", vol: "$6.1B", pairs: 980, trust: 9.2 },
  { name: "Bybit", vol: "$5.4B", pairs: 860, trust: 8.9 },
  { name: "Coinbase", vol: "$3.8B", pairs: 410, trust: 9.6 },
];

const WATCHLIST = [
  { type: "token", name: "Solana (SOL)", value: "$212.55", chg: 5.8 },
  { type: "token", name: "Jupiter (JUP)", value: "$1.08", chg: 7.9 },
  { type: "wallet", name: "7xKX...osgAsU", value: "$2,635", chg: 0 },
];

const ALERTS = [
  { label: "SOL price above $220", cond: "Price ≥ 220 USDT", status: "Active" },
  { label: "Whale wallet activity", cond: "Transfer ≥ $500K", status: "Active" },
  { label: "BONK volume spike", cond: "24h Vol +50%", status: "Paused" },
];

const API_ENDPOINTS = [
  { method: "GET", path: "/api/signals", desc: "Scored trading signals across tracked pairs" },
  { method: "GET", path: "/api/markets", desc: "Live price, volume, market cap per token" },
  { method: "GET", path: "/api/wallet/:address", desc: "Balance, holdings, activity for a wallet" },
  { method: "GET", path: "/api/token/:id", desc: "Token detail, supply, holder stats" },
  { method: "GET", path: "/api/onchain/transfers", desc: "Recent on-chain transfer feed" },
  { method: "POST", path: "/api/alerts", desc: "Create a new monitoring alert" },
];

const WALLET_OPTIONS = [
  { name: "Phantom", note: "Solana" },
  { name: "MetaMask", note: "EVM chains" },
  { name: "WalletConnect", note: "Multi-chain" },
  { name: "Coinbase Wallet", note: "Multi-chain" },
];

const NAV_GROUPS = [
  { label: "Core", items: [
    { key: "home", icon: Home, label: "Home" },
    { key: "chat", icon: Sparkles, label: "Chat" },
  ]},
  { label: "Market", items: [
    { key: "markets", icon: TrendingUp, label: "Markets" },
    { key: "token", icon: Coins, label: "Token" },
    { key: "exchange", icon: BarChart3, label: "Exchange Data" },
  ]},
  { label: "On-chain", items: [
    { key: "onchain", icon: Database, label: "On-chain Data" },
    { key: "wallet", icon: Wallet, label: "Wallet Analysis" },
    { key: "transfer", icon: ArrowLeftRight, label: "Transfer" },
    { key: "transactions", icon: Receipt, label: "Transactions" },
    { key: "entities", icon: Building2, label: "Entities" },
    { key: "smartmoney", icon: Radar, label: "Smart Money" },
  ]},
  { label: "Tools", items: [
    { key: "signal", icon: Activity, label: "Signal" },
    { key: "watchlist", icon: Star, label: "Watchlist" },
    { key: "alert", icon: Bell, label: "Alert" },
    { key: "connect", icon: Plug, label: "Connect Wallet" },
  ]},
  { label: "More", items: [
    { key: "apidocs", icon: FileCode, label: "API Docs" },
    { key: "account", icon: User, label: "Account" },
    { key: "theme", icon: Palette, label: "Theme" },
  ]},
];

/* ---------------- Logo ---------------- */

const ZENTHRA_LOGO = "data:image/png;base64,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";

function ZLogo({ size = 22 }) {
  return (
    <img
      src={ZENTHRA_LOGO}
      alt="Zenthra"
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}

/* ---------------- Shared UI ---------------- */

function PageHeader({ title, subtitle, tag }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-display text-xl font-semibold text-slate-100">{title}</h1>
        {tag && (
          <span className="text-[10px] font-data px-2 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400">
            {tag}
          </span>
        )}
      </div>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
        <Icon size={14} />
        {label}
      </div>
      <div className={"font-display text-xl font-semibold " + (accent || "text-slate-100")}>{value}</div>
    </div>
  );
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-700 text-slate-400",
    green: "border-emerald-500/30 text-emerald-400",
    red: "border-rose-500/30 text-rose-400",
    cyan: "border-cyan-500/30 text-cyan-400",
    amber: "border-amber-500/30 text-amber-400",
  };
  return (
    <span className={"text-[10px] font-data px-2 py-0.5 rounded-full border " + tones[tone]}>
      {children}
    </span>
  );
}

function Table({ head, rows }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500 text-xs">
            {head.map((h) => (
              <th key={h} className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function Tr({ children }) {
  return <tr className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">{children}</tr>;
}
function Td({ children, className = "" }) {
  return <td className={"px-3 py-2.5 whitespace-nowrap " + className}>{children}</td>;
}

/* ---------------- Pages ---------------- */

function HomePage() {
  return (
    <>
      <PageHeader title="Welcome back" subtitle="Here's what's moving across markets and wallets you track." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={LayoutDashboard} label="Tracked Market Cap" value="$2.4T" />
        <StatCard icon={Activity} label="Active Signals" value="4" accent="text-cyan-400" />
        <StatCard icon={Wallet} label="Wallets Tracked" value="12" />
        <StatCard icon={Bell} label="Open Alerts" value="2" accent="text-amber-400" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="cyan">Markets ▸ SOL +5.8%</Badge>
        <Badge tone="green">Signal ▸ SOL/USDT LONG · score 84</Badge>
        <Badge tone="amber">Alert ▸ SOL price above $220</Badge>
      </div>
    </>
  );
}

function MarketsPage() {
  return (
    <>
      <PageHeader title="Markets" subtitle="Live price, volume and market cap." tag="via CoinGecko" />
      <Table
        head={["#", "Token", "Price", "24h", "Volume", "Market Cap"]}
        rows={MARKETS.map((m) => (
          <Tr key={m.sym}>
            <Td className="text-slate-500">{m.rank}</Td>
            <Td><span className="text-slate-100">{m.name}</span> <span className="text-slate-500 font-data text-xs">{m.sym}</span></Td>
            <Td className="font-data">{m.price}</Td>
            <Td className={m.chg >= 0 ? "text-emerald-400" : "text-rose-400"}>{m.chg >= 0 ? "+" : ""}{m.chg}%</Td>
            <Td className="font-data text-slate-400">{m.vol}</Td>
            <Td className="font-data text-slate-400">{m.mcap}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function TokenPage() {
  const t = TOKEN_DETAIL;
  return (
    <>
      <PageHeader title={t.name + " (" + t.sym + ")"} tag="via CoinGecko + TradingView" />
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-display text-3xl font-semibold text-slate-100">{t.price}</span>
        <span className="text-emerald-400 text-sm">+{t.chg}%</span>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl h-48 flex items-center justify-center text-slate-600 text-sm mb-4">
        TradingView chart widget embeds here
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={BarChart3} label="Market Cap" value={t.mcap} />
        <StatCard icon={Activity} label="Volume 24h" value={t.vol} />
        <StatCard icon={Coins} label="Circ. Supply" value={t.supply} />
        <StatCard icon={User} label="Holders" value={t.holders} />
      </div>
    </>
  );
}

function OnChainPage() {
  return (
    <>
      <PageHeader title="On-chain Data" subtitle="Cross-chain activity overview." tag="via Etherscan + Helius" />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon={Activity} label="24h Volume" value={ONCHAIN_STATS.vol} />
        <StatCard icon={Wallet} label="Active Wallets" value={ONCHAIN_STATS.wallets} />
        <StatCard icon={Gauge} label="Avg Gas" value={ONCHAIN_STATS.gas} />
      </div>
      <Table
        head={["Chain", "Event", "Value", "Time"]}
        rows={ONCHAIN_EVENTS.map((e, i) => (
          <Tr key={i}>
            <Td><Badge tone="cyan">{e.chain}</Badge></Td>
            <Td>{e.type}</Td>
            <Td className="font-data text-slate-300">{e.value}</Td>
            <Td className="text-slate-500">{e.time}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function WalletAnalysisPage() {
  const w = WALLET_DEMO;
  return (
    <>
      <PageHeader title="Wallet Analysis" subtitle="Search any Solana or EVM address." tag="via Helius + Etherscan" />
      <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 mb-5">
        <Search size={16} className="text-slate-500" />
        <input
          defaultValue={w.address}
          readOnly
          className="flex-1 bg-transparent outline-none text-sm font-data text-slate-300"
        />
        <button className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 font-medium">
          Analyze
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {w.smartMoney && <Badge tone="cyan">Smart Money</Badge>}
        <span className="text-slate-400 text-sm">Balance</span>
        <span className="font-data text-slate-100">{w.balance}</span>
        <span className="text-slate-500 text-sm">({w.usd})</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">Holdings</div>
          <div className="space-y-1.5">
            {w.holdings.map((h, i) => (
              <div key={i} className="flex justify-between text-sm bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
                <span className="text-slate-300">{h.token}</span>
                <span className="font-data text-slate-500">{h.amount}</span>
                <span className="font-data text-slate-300">{h.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">Recent Activity</div>
          <div className="space-y-1.5">
            {w.activity.map((a, i) => (
              <div key={i} className="flex justify-between text-sm bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
                <span className="text-slate-300">{a.action}</span>
                <span className="text-slate-500">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function TransferPage() {
  return (
    <>
      <PageHeader title="Transfer" subtitle="Live on-chain token transfer feed." tag="via Helius + Etherscan" />
      <Table
        head={["Token", "Amount", "From", "To", "Chain", "Time"]}
        rows={TRANSFERS.map((t, i) => (
          <Tr key={i}>
            <Td className="text-slate-200">{t.token}</Td>
            <Td className="font-data text-slate-300">{t.amount}</Td>
            <Td className="font-data text-slate-500 flex items-center gap-1"><ArrowUpRight size={12} />{t.from}</Td>
            <Td className="font-data text-slate-500"><ArrowDownLeft size={12} className="inline mr-1" />{t.to}</Td>
            <Td><Badge tone="cyan">{t.chain}</Badge></Td>
            <Td className="text-slate-500">{t.time}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function TransactionsPage() {
  const toneFor = (s) => (s === "Success" ? "green" : s === "Pending" ? "amber" : "red");
  return (
    <>
      <PageHeader title="Transactions" subtitle="Recent on-chain transactions." tag="via Etherscan + Helius" />
      <Table
        head={["Hash", "Type", "Value", "Status", "Time"]}
        rows={TRANSACTIONS.map((t, i) => (
          <Tr key={i}>
            <Td className="font-data text-slate-400">{t.hash}</Td>
            <Td>{t.type}</Td>
            <Td className="font-data text-slate-300">{t.value}</Td>
            <Td><Badge tone={toneFor(t.status)}>{t.status}</Badge></Td>
            <Td className="text-slate-500">{t.time}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function EntitiesPage() {
  return (
    <>
      <PageHeader title="Entities" subtitle="Labeled wallets and organizations." tag="via Arkham" />
      <Table
        head={["Entity", "Type", "Address", "Chain"]}
        rows={ENTITIES.map((e, i) => (
          <Tr key={i}>
            <Td className="text-slate-100 flex items-center gap-2"><Fingerprint size={14} className="text-cyan-400" />{e.name}</Td>
            <Td><Badge>{e.type}</Badge></Td>
            <Td className="font-data text-slate-500">{e.address}</Td>
            <Td className="text-slate-400">{e.chain}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function SmartMoneyPage() {
  return (
    <>
      <PageHeader title="Smart Money" subtitle="Top-performing wallets by win rate." tag="via Nansen" />
      <Table
        head={["#", "Wallet", "Win Rate", "PnL 30D", "Last Trade"]}
        rows={SMART_MONEY.map((s) => (
          <Tr key={s.rank}>
            <Td className="text-slate-500">{s.rank}</Td>
            <Td className="font-data text-slate-300">{s.wallet}</Td>
            <Td>{s.winRate}</Td>
            <Td className="text-emerald-400">{s.pnl}</Td>
            <Td className="text-slate-500">{s.last}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function SignalPage() {
  return (
    <>
      <PageHeader title="Signal" subtitle="Multi-confluence scoring across tracked pairs." tag="ZENTHRA Engine · via Binance" />
      <Table
        head={["Pair", "Direction", "Score", "Entry", "SL", "TP", "TF"]}
        rows={SIGNALS.map((s, i) => (
          <Tr key={i}>
            <Td className="text-slate-100">{s.pair}</Td>
            <Td><Badge tone={s.dir === "LONG" ? "green" : "red"}>{s.dir}</Badge></Td>
            <Td>
              <div className="flex items-center gap-2">
                <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: s.score + "%" }} />
                </div>
                <span className="text-slate-400 text-xs">{s.score}</span>
              </div>
            </Td>
            <Td className="font-data text-slate-400">{s.entry}</Td>
            <Td className="font-data text-rose-400">{s.sl}</Td>
            <Td className="font-data text-emerald-400">{s.tp}</Td>
            <Td className="text-slate-500">{s.tf}</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function ExchangeDataPage() {
  return (
    <>
      <PageHeader title="Exchange Data" subtitle="Volume and trust across CEXs." tag="via CoinGecko" />
      <Table
        head={["Exchange", "24h Volume", "Pairs", "Trust Score"]}
        rows={EXCHANGES.map((e, i) => (
          <Tr key={i}>
            <Td className="text-slate-100">{e.name}</Td>
            <Td className="font-data text-slate-400">{e.vol}</Td>
            <Td className="text-slate-400">{e.pairs}</Td>
            <Td className="text-cyan-400">{e.trust}/10</Td>
          </Tr>
        ))}
      />
    </>
  );
}

function WatchlistPage() {
  return (
    <>
      <PageHeader title="Watchlist" subtitle="Tokens and wallets you're tracking." />
      <div className="grid md:grid-cols-2 gap-3">
        {WATCHLIST.map((w, i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-200 font-data">{w.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{w.type === "token" ? "Token" : "Wallet"}</div>
            </div>
            <div className="text-right">
              <div className="font-data text-slate-200 text-sm">{w.value}</div>
              {w.chg !== 0 && (
                <div className={"text-xs " + (w.chg >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {w.chg >= 0 ? "+" : ""}{w.chg}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AlertPage() {
  return (
    <>
      <PageHeader title="Alert" subtitle="Get notified the moment something moves." />
      <button className="flex items-center gap-2 text-sm text-slate-950 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg px-4 py-2 mb-4 font-medium">
        <Plus size={15} /> New Alert
      </button>
      <div className="space-y-2">
        {ALERTS.map((a, i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-200">{a.label}</div>
              <div className="text-xs text-slate-500 font-data mt-0.5">{a.cond}</div>
            </div>
            <Badge tone={a.status === "Active" ? "green" : "slate"}>{a.status}</Badge>
          </div>
        ))}
      </div>
    </>
  );
}

function ConnectWalletPage() {
  return (
    <>
      <PageHeader title="Connect Wallet" subtitle="Solana and EVM chains supported." />
      <div className="space-y-2 max-w-sm">
        {WALLET_OPTIONS.map((w, i) => (
          <button key={i} className="w-full flex items-center justify-between bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 rounded-xl px-4 py-3 transition-colors">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-slate-950 text-xs font-semibold">
                {w.name[0]}
              </div>
              <div className="text-left">
                <div className="text-sm text-slate-200">{w.name}</div>
                <div className="text-xs text-slate-500">{w.note}</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-600" />
          </button>
        ))}
      </div>
    </>
  );
}

function ApiDocsPage() {
  return (
    <>
      <PageHeader title="API Docs" subtitle="Endpoints powering the Zenthra platform." />
      <div className="space-y-2">
        {API_ENDPOINTS.map((e, i) => (
          <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-start gap-3">
            <Badge tone={e.method === "GET" ? "cyan" : "green"}>{e.method}</Badge>
            <div>
              <div className="font-data text-sm text-slate-200">{e.path}</div>
              <div className="text-xs text-slate-500 mt-0.5">{e.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AccountPage() {
  return (
    <>
      <PageHeader title="Account" />
      <div className="flex items-center gap-3 mb-6">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
          <ZLogo size={26} />
        </div>
        <div>
          <div className="text-slate-100 font-medium">Zenthra User</div>
          <Badge tone="cyan">Free Plan</Badge>
        </div>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <KeyRound size={15} className="text-slate-500" /> API Key
        </div>
        <span className="font-data text-xs text-slate-500">zk_live_••••••••3f9a</span>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <ShieldCheck size={15} className="text-slate-500" /> Two-factor auth
        </div>
        <span className="text-xs text-slate-500">Off</span>
      </div>
      <button className="flex items-center gap-2 text-sm text-rose-400 px-4 py-2">
        <LogOut size={15} /> Sign out
      </button>
    </>
  );
}

function ThemePage() {
  return (
    <>
      <PageHeader title="Theme" subtitle="Zenthra runs dark by design." />
      <div className="flex gap-3">
        <div className="border-2 border-cyan-500 rounded-xl p-3 w-28">
          <div className="h-14 rounded-lg bg-slate-950 border border-slate-800 mb-2" />
          <div className="text-xs text-slate-200 text-center">Dark</div>
        </div>
        <div className="border border-slate-800 rounded-xl p-3 w-28 opacity-40">
          <div className="h-14 rounded-lg bg-slate-100 mb-2" />
          <div className="text-xs text-slate-500 text-center">Light — soon</div>
        </div>
      </div>
    </>
  );
}

const PAGES = {
  home: HomePage, markets: MarketsPage, token: TokenPage, onchain: OnChainPage,
  wallet: WalletAnalysisPage, transfer: TransferPage, transactions: TransactionsPage,
  entities: EntitiesPage, smartmoney: SmartMoneyPage, signal: SignalPage,
  exchange: ExchangeDataPage, watchlist: WatchlistPage, alert: AlertPage,
  connect: ConnectWalletPage, apidocs: ApiDocsPage, account: AccountPage, theme: ThemePage,
};

/* ---------------- App ---------------- */

export default function ZenthraApp() {
  const [page, setPage] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [reactions, setReactions] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [showAttach, setShowAttach] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [streamingIdx, setStreamingIdx] = useState(null);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const cameraInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamTimers = useRef({});

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, [input]);

  useEffect(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { setMicSupported(false); return; }
    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recognitionRef.current = recog;
    return () => { try { recog.stop(); } catch {} };
  }, []);

  function toggleMic() {
    if (!micSupported || !recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try { recognitionRef.current.start(); setListening(true); } catch {}
    }
  }

  function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    setAttachments((a) => [...a, ...files.map((f) => ({ name: f.name }))]);
    setShowAttach(false);
    e.target.value = "";
  }

  function streamInto(idx, fullText) {
    clearInterval(streamTimers.current[idx]);
    setStreamingIdx(idx);
    let i = 0;
    streamTimers.current[idx] = setInterval(() => {
      i += 3;
      setMessages((m) => {
        if (!m[idx]) return m;
        const copy = [...m];
        copy[idx] = { ...copy[idx], text: fullText.slice(0, i) };
        return copy;
      });
      if (i >= fullText.length) {
        clearInterval(streamTimers.current[idx]);
        setStreamingIdx((cur) => (cur === idx ? null : cur));
      }
    }, 18);
  }

  function appendAndStream(fullText) {
    setMessages((m) => {
      const idx = m.length;
      setTimeout(() => streamInto(idx, fullText), 0);
      return [...m, { role: "assistant", text: "" }];
    });
  }

  async function send(text) {
    const value = (text ?? input).trim();
    if (!value) return;
    const newMessages = [...messages, { role: "user", text: value }];
    setMessages(newMessages);
    setInput("");
    setAttachments([]);
    setThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, history: newMessages }),
      });
      if (!res.ok) throw new Error("api unavailable");
      const data = await res.json();
      setThinking(false);
      appendAndStream(data.reply || pickDemoReply(value));
    } catch (err) {
      // No live backend in this preview \u2014 in the real deploy this same fetch
      // hits app/api/chat/route.ts (Gemini + tool calls). Demo fallback below.
      setThinking(false);
      appendAndStream(pickDemoReply(value));
    }
  }

  function copyMsg(idx, text) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1200);
  }

  function react(idx, type) {
    setReactions((r) => ({ ...r, [idx]: r[idx] === type ? undefined : type }));
  }

  function regenerate(idx) {
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const q = messages[idx - 1]?.text || "";
      streamInto(idx, pickDemoReply(q));
    }, 900);
  }

  const Page = PAGES[page];

  return (
    <div className="h-screen w-full flex bg-slate-950 text-slate-200 overflow-hidden" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui; }
        .font-data { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes scanSweep {
          0% { transform: translateX(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        .scan-beam {
          position: absolute; top: 0; left: 0; height: 1px; width: 40%;
          background: linear-gradient(90deg, transparent, #22D3EE, #3B82F6, transparent);
          animation: scanSweep 1.6s ease-in-out infinite;
        }
        .msg-enter { animation: fadeUp 0.35s ease-out; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        @keyframes softPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .cursor-blink { animation: softPulse 1s ease-in-out infinite; }
        @keyframes glowPulse { 0%, 100% { opacity: 0.25; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.06); } }
        .hero-glow { animation: glowPulse 4s ease-in-out infinite; }
      `}</style>

      {/* Sidebar */}
      <aside
        className={"fixed md:static z-30 h-full w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 " +
          (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <ZLogo size={20} />
            <span className="font-display font-semibold text-slate-100 tracking-tight">Zenthra</span>
          </div>
          <button className="md:hidden text-slate-500" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="p-3 shrink-0">
          <button
            onClick={() => { setMessages([]); setPage("chat"); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 rounded-lg border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-800/60 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.15)] text-slate-300 text-sm px-3 py-2.5 transition-all"
          >
            <Plus size={16} className="text-cyan-400" />
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-2 pb-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-medium">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = page === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => { setPage(item.key); setSidebarOpen(false); }}
                      className={"w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors text-left " +
                        (active
                          ? "bg-gradient-to-r from-cyan-500/15 to-transparent text-cyan-300 border-l-2 border-cyan-400 pl-2"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200")}
                    >
                      <item.icon size={15} className="shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {group.label === "Core" && (
                <>
                  <div className="px-2 text-[11px] uppercase tracking-wider text-slate-600 mb-1 mt-3 font-medium">
                    Recent
                  </div>
                  <div className="space-y-0.5">
                    {HISTORY.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => { setPage("chat"); setSidebarOpen(false); }}
                        className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-left"
                      >
                        <MessageSquare size={14} className="shrink-0 text-slate-600" />
                        <span className="truncate font-data text-xs">{h.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-slate-800 flex items-center gap-2 text-xs text-slate-600 shrink-0">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500" />
          <span>On-chain Intelligence</span>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {showAttach && (
        <div className="fixed inset-0 z-10" onClick={() => setShowAttach(false)} />
      )}

      {/* Hidden file inputs \u2014 genuinely wired for camera / photo / file */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFilePick} />
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden fixed top-3 left-3 z-10 h-9 w-9 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 backdrop-blur"
        >
          <Menu size={18} />
        </button>

        {page === "chat" ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center px-6 text-center relative">
                  <div className="hero-glow absolute w-40 h-40 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
                  <div className="relative"><ZLogo size={44} /></div>
                  <h1 className="font-display text-2xl font-semibold text-slate-100 mt-4 relative">
                    Ask Zenthra anything on-chain
                  </h1>
                  <p className="text-slate-500 text-sm mt-2 max-w-sm relative">
                    Wallets, tokens, smart money flow \u2014 plain questions, real chain data.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-6 relative">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => send(s.label)}
                        className="flex items-center gap-2 text-sm text-slate-300 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900 hover:-translate-y-0.5 rounded-full px-4 py-2 transition-all"
                      >
                        <s.icon size={14} className="text-cyan-400" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pt-14 md:pt-6">
                  {messages.map((m, i) => (
                    <div key={i} className={"msg-enter flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
                      {m.role === "user" ? (
                        <div className="max-w-[80%] flex flex-col items-end gap-1 group">
                          <div className="bg-gradient-to-br from-cyan-500/15 to-blue-500/15 border border-cyan-500/20 rounded-2xl rounded-br-sm px-4 py-2.5 text-slate-100 text-sm shadow-lg shadow-black/10">
                            {m.text}
                          </div>
                          <button
                            onClick={() => copyMsg(i, m.text)}
                            className="text-slate-600 hover:text-slate-300 p-1 flex items-center gap-1 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Copy size={11} /> {copiedIdx === i ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-[85%] flex flex-col gap-1.5">
                          <div className="flex gap-3">
                            <div className="shrink-0 mt-0.5"><ZLogo size={18} /></div>
                            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                              {m.text}
                              {streamingIdx === i && <span className="cursor-blink text-cyan-400">▉</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 ml-8">
                            <button
                              onClick={() => copyMsg(i, m.text)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              onClick={() => react(i, "up")}
                              className={"p-1.5 rounded-md transition-colors " + (reactions[i] === "up" ? "text-cyan-400 bg-cyan-500/10" : "text-slate-600 hover:text-slate-300 hover:bg-slate-800")}
                            >
                              <ThumbsUp size={13} />
                            </button>
                            <button
                              onClick={() => react(i, "down")}
                              className={"p-1.5 rounded-md transition-colors " + (reactions[i] === "down" ? "text-rose-400 bg-rose-500/10" : "text-slate-600 hover:text-slate-300 hover:bg-slate-800")}
                            >
                              <ThumbsDown size={13} />
                            </button>
                            <button
                              onClick={() => regenerate(i)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                              <RotateCcw size={13} />
                            </button>
                            {copiedIdx === i && <span className="text-[10px] text-slate-600 ml-1">Copied</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {thinking && (
                    <div className="flex gap-3 relative items-center">
                      <div className="shrink-0"><ZLogo size={18} /></div>
                      <span className="text-xs text-slate-600">Zenthra is thinking</span>
                      <div className="relative w-24 h-4 overflow-hidden rounded">
                        <div className="scan-beam" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 p-3 md:p-4 shrink-0">
              <div className="max-w-2xl mx-auto">
                {attachments.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap px-1 mb-2">
                    {attachments.map((a, i) => (
                      <span key={i} className="flex items-center gap-1.5 text-xs bg-slate-800 text-slate-300 rounded-full pl-2.5 pr-1.5 py-1 border border-slate-700">
                        <Paperclip size={11} className="text-cyan-400" />
                        {a.name.length > 18 ? a.name.slice(0, 16) + "\u2026" : a.name}
                        <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="hover:text-rose-400 ml-0.5">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-1.5 bg-slate-900 border border-slate-800 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.08)] rounded-2xl px-2 py-2 transition-all">
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowAttach((v) => !v)}
                      className="h-8 w-8 rounded-full flex items-center justify-center text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                    >
                      <Plus size={18} className={"transition-transform " + (showAttach ? "rotate-45" : "")} />
                    </button>
                    {showAttach && (
                      <div className="absolute bottom-full left-0 mb-2 z-20 bg-slate-900 border border-slate-800 rounded-xl shadow-xl shadow-black/40 py-1.5 w-44 text-sm">
                        <button onClick={() => cameraInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:bg-slate-800 transition-colors">
                          <Camera size={15} className="text-cyan-400" /> Camera
                        </button>
                        <button onClick={() => photoInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:bg-slate-800 transition-colors">
                          <ImageIcon size={15} className="text-cyan-400" /> Photo
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:bg-slate-800 transition-colors">
                          <Paperclip size={15} className="text-cyan-400" /> File
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Ask about a wallet, token, or transaction..."
                    rows={1}
                    className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-200 placeholder:text-slate-600 py-1.5 max-h-32"
                  />

                  <button
                    onClick={toggleMic}
                    title={micSupported ? "Voice input" : "Voice input isn't supported in this browser"}
                    className={"relative shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-colors " +
                      (listening ? "text-rose-400 bg-rose-500/10" : "text-slate-500 hover:text-cyan-400 hover:bg-slate-800") +
                      (!micSupported ? " opacity-40 cursor-not-allowed" : "")}
                  >
                    {listening && <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />}
                    <Mic size={17} className="relative" />
                  </button>

                  <button
                    onClick={() => send()}
                    disabled={!input.trim()}
                    className="shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 disabled:from-slate-700 disabled:to-slate-700 flex items-center justify-center transition-all hover:shadow-[0_0_12px_rgba(34,211,238,0.4)] disabled:hover:shadow-none"
                  >
                    <ArrowUp size={16} className="text-slate-950" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-700 text-center mt-2">
                  Zenthra can make mistakes. Verify signals before trading.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-5 pt-14 md:pt-5 md:px-6">
            <div className="max-w-4xl mx-auto">
              <Page />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
