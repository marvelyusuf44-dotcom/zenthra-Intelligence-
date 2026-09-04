import React, { useEffect, useState } from "react";

interface Claim {
  id: string;
  user_id: string;
  tier: string;
  note: string | null;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminSecret, setAdminSecret] = useState(() => localStorage.getItem("zenthra_admin_secret") || "");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchClaims = async () => {
    if (!adminSecret) {
      alert("Masukkan Admin Secret Key terlebih dahulu.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/billing/admin/claims?status=pending", {
        headers: { "x-admin-secret": adminSecret },
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data);
        localStorage.setItem("zenthra_admin_secret", adminSecret);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Gagal: " + (err.error || "Secret key salah atau error server"));
      }
    } catch (err) {
      alert("Terjadi kesalahan koneksi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchClaims();
    }
  }, []);

  const handleConfirm = async (claimId: string) => {
    setActionLoading(claimId);
    try {
      const res = await fetch("/api/billing/admin/confirm-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ claimId }),
      });

      if (res.ok) {
        alert("Pembayaran berhasil di-approve! Tier langganan user aktif.");
        fetchClaims();
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Gagal approve: " + (err.error || "Terjadi kesalahan"));
      }
    } catch (err) {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (claimId: string) => {
    if (!confirm("Yakin ingin menolak klaim ini?")) return;
    setActionLoading(claimId);
    try {
      const res = await fetch("/api/billing/admin/reject-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ claimId }),
      });

      if (res.ok) {
        alert("Klaim pembayaran ditolak.");
        fetchClaims();
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Gagal menolak: " + (err.error || "Terjadi kesalahan"));
      }
    } catch (err) {
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto", color: "#fff", fontFamily: "sans-serif" }}>
      <h2 style={{ borderBottom: "1px solid #333", paddingBottom: "10px" }}>Zenthra Admin Approval</h2>

      <div style={{ marginBottom: "20px", background: "#1a1a1a", padding: "15px", borderRadius: "8px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "#aaa" }}>
          Admin API Secret:
        </label>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="Masukkan ADMIN_API_SECRET"
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #444",
              background: "#222",
              color: "#fff",
            }}
          />
          <button
            onClick={fetchClaims}
            style={{
              padding: "10px 16px",
              background: "#00e5ff",
              color: "#000",
              fontWeight: "bold",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Muat
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "#aaa" }}>Memuat antrian pembayaran...</p>
      ) : claims.length === 0 ? (
        <p style={{ textAlign: "center", color: "#666", marginTop: "30px" }}>Tidak ada klaim pembayaran pending.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          {claims.map((claim) => (
            <div
              key={claim.id}
              style={{
                padding: "15px",
                border: "1px solid #333",
                borderRadius: "8px",
                background: "#111",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontWeight: "bold", color: "#00e5ff", textTransform: "uppercase" }}>
                  Tier: {claim.tier}
                </span>
                <span style={{ fontSize: "12px", color: "#888" }}>
                  {new Date(claim.created_at).toLocaleString("id-ID")}
                </span>
              </div>

              <p style={{ margin: "5px 0", fontSize: "14px", color: "#ccc" }}>
                <strong>User ID:</strong> <code style={{ background: "#222", padding: "2px 4px", borderRadius: "3px" }}>{claim.user_id}</code>
              </p>
              <p style={{ margin: "5px 0", fontSize: "14px", color: "#ccc" }}>
                <strong>Catatan Jam Bayar:</strong> {claim.note || "-"}
              </p>

              <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
                <button
                  onClick={() => handleConfirm(claim.id)}
                  disabled={actionLoading === claim.id}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#00c853",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {actionLoading === claim.id ? "Proses..." : "Approve"}
                </button>

                <button
                  onClick={() => handleReject(claim.id)}
                  disabled={actionLoading === claim.id}
                  style={{
                    padding: "10px 16px",
                    background: "#d50000",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Tolak
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
