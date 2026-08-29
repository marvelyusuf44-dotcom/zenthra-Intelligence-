// src/pages/pricing.tsx
//
// Alur pembayaran QRIS MANUAL (belum payment gateway otomatis — lihat catatan
// di routes/billing.ts): user pilih tier → scan QRIS → klik "Saya sudah bayar"
// → admin approve manual dari sisi backend.

import { useEffect, useState } from 'react';
import { Check, CircleAlert, QrCode } from 'lucide-react';
import qrisImage from '@/assets/qris-zenthra.jpg';

interface Plan {
  id: 'free' | 'pelajar' | 'plus' | 'pro';
  label: string;
  priceIdrPerMonth: number;
  quotas: Record<string, number | 'unlimited'>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('zenthra_token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

function formatIdr(n: number) {
  if (n === 0) return 'Gratis';
  return `Rp${n.toLocaleString('id-ID')}`;
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan['id'] | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/billing/plans`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setPlans)
      .catch(() => setError('Gagal memuat daftar tier.'));
  }, []);

  const submitClaim = async () => {
    if (!selected || selected === 'free') return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/billing/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ tier: selected, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Gagal mengirim konfirmasi.');
      }
      setClaimed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim konfirmasi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="z-in mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="font-display text-2xl font-semibold tracking-[-.03em] text-slate-100">Pricing</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Tier murah buat pelajar sampai kuota unlimited buat trader aktif. Bayar sekali lewat QRIS, dikonfirmasi manual
        (belum ada payment gateway otomatis, jadi butuh sedikit sabar sampai admin approve).
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            data-testid={`card-plan-${plan.id}`}
            onClick={() => plan.id !== 'free' && setSelected(plan.id)}
            disabled={plan.id === 'free'}
            className={`panel rounded-xl p-4 text-left transition-colors ${
              selected === plan.id ? 'border-cyan-400/50 bg-cyan-400/[.06]' : ''
            } ${plan.id === 'free' ? 'cursor-default opacity-70' : 'hover:border-cyan-400/40'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-100">{plan.label}</span>
              {selected === plan.id && <Check size={16} className="text-cyan-300" />}
            </div>
            <div className="mt-1 font-data text-lg text-slate-200">
              {formatIdr(plan.priceIdrPerMonth)}
              {plan.priceIdrPerMonth > 0 && <span className="text-xs text-slate-600"> /bulan</span>}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">
              <li>Chat: {plan.quotas.chat === 'unlimited' ? 'Unlimited' : `${plan.quotas.chat}/hari`}</li>
              <li>On-chain lookup: {plan.quotas.onchain === 'unlimited' ? 'Unlimited' : `${plan.quotas.onchain}/hari`}</li>
              <li>Creative tools: {plan.quotas.creative === 'unlimited' ? 'Unlimited' : `${plan.quotas.creative}/hari`}</li>
            </ul>
          </button>
        ))}
      </div>

      {selected && !claimed && (
        <div className="panel mt-6 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <QrCode size={16} className="text-cyan-300" />
            Scan QRIS buat bayar tier {plans.find((p) => p.id === selected)?.label}
          </div>
          <img src={qrisImage} alt="QRIS Zenthra" className="mx-auto mt-4 w-56 rounded-lg border border-slate-800" />
          <p className="mt-3 text-center text-xs text-slate-500">
            Setelah transfer, klik tombol di bawah. Admin akan cek mutasi manual — biasanya kelar dalam beberapa jam.
          </p>
          <input
            data-testid="input-payment-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opsional: jam bayar / 4 digit terakhir referensi (bantu admin cocokin)"
            className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 outline-none focus:border-cyan-400/40"
          />
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/[.06] p-3 text-xs text-rose-200">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button
            data-testid="button-confirm-payment"
            onClick={() => void submitClaim()}
            disabled={submitting}
            className="mt-4 w-full rounded-lg bg-cyan-300 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {submitting ? 'Mengirim…' : 'Saya sudah bayar'}
          </button>
        </div>
      )}

      {claimed && (
        <div className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[.06] p-4 text-sm text-emerald-200">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>Konfirmasi diterima. Tier kamu aktif otomatis begitu admin approve pembayarannya.</span>
        </div>
      )}
    </div>
  );
}
