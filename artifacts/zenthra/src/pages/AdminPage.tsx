import { useEffect, useState } from "react";

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
  const [adminSecret, setAdminSecret] = useState(() => 
    localStorage.getItem("zenthra_admin_secret") || ""
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchClaims = async () => {
    if (!adminSecret) {
      alert("Masukkan Admin Secret terlebih dahulu");
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem("zenthra_admin_secret", adminSecret);
      const res = await fetch("/api/admin/claims", {
        headers: { "x-admin-secret": adminSecret },
      });
      if (!res.ok) throw new Error("Gagal memuat data (Secret salah?)");
      const data = await res.json();
      setClaims(data);
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchClaims();
    }
  }, []);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/claims/${id}/${action}`, {
        method: "POST",
        headers: { "x-admin-secret": adminSecret },
      });
      if (!res.ok) throw new Error(`Gagal memproses ${action}`);
      alert(`Berhasil ${action} klaim!`);
      fetchClaims();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto", color: "#fff" }}>
      <h1 style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "16px" }}>
        Admin Dashboard - QRIS Approvals
      </h1>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="password"
          placeholder="Masukkan Admin Secret"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          style={{
            flex: 1,
            padding: "10px",
            background: "#1a1a1a",
            border: "1px solid #444",
            color: "#fff",
            borderRadius: "6px"
          }}
        />
        <button
          onClick={fetchClaims}
          style={{
            padding: "10px 20px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          {loading ? "Memuat..." : "Muat"}
        </button>
      </div>

      <div>
        <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>Daftar Klaim Pending</h2>
        {claims.length === 0 ? (
          <p style={{ color: "#aaa" }}>Tidak ada klaim pending atau belum dimuat.</p>
        ) : (
          claims.map((c) => (
            <div
              key={c.id}
              style={{
                background: "#1f2937",
                padding: "16px",
                borderRadius: "8px",
                marginBottom: "12px",
                border: "1px solid #374151"
              }}
            >
              <p><strong>ID:</strong> {c.id}</p>
              <p><strong>User ID:</strong> {c.user_id}</p>
              <p><strong>Tier:</strong> {c.tier}</p>
              <p><strong>Note:</strong> {c.note || "-"}</p>
              <p><strong>Status:</strong> {c.status}</p>
              <p><strong>Waktu:</strong> {new Date(c.created_at).toLocaleString()}</p>

              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button
                  onClick={() => handleAction(c.id, "approve")}
                  disabled={actionLoading === c.id}
                  style={{
                    padding: "8px 16px",
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  {actionLoading === c.id ? "Proses..." : "Approve"}
                </button>
                <button
                  onClick={() => handleAction(c.id, "reject")}
                  disabled={actionLoading === c.id}
                  style={{
                    padding: "8px 16px",
                    background: "#dc2626",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  {actionLoading === c.id ? "Proses..." : "Reject"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
