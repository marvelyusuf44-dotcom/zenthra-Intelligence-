// src/pages/whatsapp-connect.tsx
//
// "Connect your WhatsApp" — pakai WhatsApp Embedded Signup resmi Meta lewat
// Facebook JS SDK. TIDAK ada automation WhatsApp Web / library tidak resmi.

import { useEffect, useState } from 'react';
import { CircleAlert, MessageCircle, Trash2 } from 'lucide-react';

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface WaConfig {
  appId: string;
  configId: string;
}

interface WaConnection {
  id: string;
  waba_id: string;
  phone_number_id: string;
  business_name: string | null;
  status: 'active' | 'revoked';
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('zenthra_token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

function loadFacebookSdk(): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
}

export default function WhatsAppConnectPage() {
  const [config, setConfig] = useState<WaConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [connections, setConnections] = useState<WaConnection[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const loadConnections = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/connect`, { headers: authHeaders() });
      if (res.ok) setConnections(await res.json());
    } catch {
      // diamkan — daftar kosong tetap aman ditampilkan
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/whatsapp/connect/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: WaConfig) => setConfig(data))
      .catch(() => setConfigError('WhatsApp Embedded Signup belum dikonfigurasi di server.'));
    void loadConnections();

    // Tangkap event postMessage dari popup Embedded Signup — di situ Meta ngirim
    // waba_id & phone_number_id yang baru saja user pilih/verifikasi.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
          window.sessionStorage.setItem('zenthra_wa_pending', JSON.stringify(data.data));
        }
      } catch {
        // bukan pesan Embedded Signup, abaikan
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connect = async () => {
    if (!config) return;
    setError('');
    setConnecting(true);
    try {
      await loadFacebookSdk();
      window.FB!.init({ appId: config.appId, xfbml: false, version: 'v21.0' });

      window.FB!.login(
        async (response) => {
          const code = response.authResponse?.code;
          const pendingRaw = window.sessionStorage.getItem('zenthra_wa_pending');
          const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

          if (!code || !pending?.phone_number_id || !pending?.waba_id) {
            setError('Proses connect dibatalkan atau tidak lengkap. Coba lagi.');
            setConnecting(false);
            return;
          }

          try {
            const res = await fetch(`${API_BASE}/api/whatsapp/connect/callback`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', ...authHeaders() },
              body: JSON.stringify({
                code,
                wabaId: pending.waba_id,
                phoneNumberId: pending.phone_number_id,
                businessName: pending.business_name,
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? 'Gagal menghubungkan WhatsApp.');
            }
            window.sessionStorage.removeItem('zenthra_wa_pending');
            await loadConnections();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menghubungkan WhatsApp.');
          } finally {
            setConnecting(false);
          }
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: '3' },
        },
      );
    } catch {
      setError('Gagal memuat Facebook SDK. Cek koneksi internet lalu coba lagi.');
      setConnecting(false);
    }
  };

  const disconnect = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/whatsapp/connect/${id}`, { method: 'DELETE', headers: authHeaders() });
      await loadConnections();
    } catch {
      setError('Gagal memutuskan koneksi. Coba lagi.');
    }
  };

  return (
    <div className="z-in mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="font-display text-2xl font-semibold tracking-[-.03em] text-slate-100">Connect your WhatsApp</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Hubungkan nomor WhatsApp Business kamu sendiri lewat WhatsApp Embedded Signup resmi Meta. Zenthra tidak pernah
        menyimpan atau memakai automation WhatsApp Web tidak resmi.
      </p>

      {configError && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[.06] p-4 text-xs text-amber-200">
          <CircleAlert size={15} className="mt-0.5 shrink-0" />
          <span>{configError}</span>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-400/[.06] p-4 text-xs text-rose-200">
          <CircleAlert size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        data-testid="button-connect-whatsapp"
        onClick={() => void connect()}
        disabled={!config || connecting}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
      >
        <MessageCircle size={16} />
        {connecting ? 'Menghubungkan…' : 'Connect WhatsApp Business'}
      </button>

      <div className="mt-8">
        <h2 className="mb-2 text-[11px] uppercase tracking-[.12em] text-slate-600">Nomor terhubung</h2>
        {connections.length === 0 ? (
          <p className="text-xs text-slate-600">Belum ada nomor WhatsApp yang terhubung.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="panel flex items-center justify-between rounded-xl p-4">
                <div>
                  <div className="text-sm text-slate-200">{c.business_name ?? c.phone_number_id}</div>
                  <div className="mt-0.5 font-data text-[10px] text-slate-600">
                    WABA {c.waba_id} · {c.status === 'active' ? 'Aktif' : 'Terputus'}
                  </div>
                </div>
                {c.status === 'active' && (
                  <button
                    data-testid={`button-disconnect-${c.id}`}
                    onClick={() => void disconnect(c.id)}
                    className="rounded-md p-2 text-slate-600 hover:bg-rose-400/10 hover:text-rose-300"
                    aria-label="Putuskan koneksi"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
