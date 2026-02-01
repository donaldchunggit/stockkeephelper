"use client";

import { useEffect, useState } from "react";
import { api, type Product } from "./lib/api";

type ProductDraft = {
  sku: string;
  name: string;
  onHand: string;
  reorderPoint: string;
  reorderQty: string;
};

function toInt(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export default function InventoryPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState<ProductDraft>({
    sku: "",
    name: "",
    onHand: "0",
    reorderPoint: "0",
    reorderQty: "0"
  });

  async function reload() {
    setErr(null);
    setLoading(true);
    try {
      const data = await api.listProducts();
      setRows(data);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function adjust(sku: string, delta: number) {
    setErr(null);
    setMsg(null);
    try {
      await api.adjustProduct(sku, delta);
      await reload();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  async function saveProduct() {
    setErr(null);
    setMsg(null);

    const sku = draft.sku.trim();
    const name = draft.name.trim();
    const onHand = toInt(draft.onHand);
    const reorderPoint = toInt(draft.reorderPoint);
    const reorderQty = toInt(draft.reorderQty);

    if (!sku) return setErr("SKU is required");
    if (!name) return setErr("Name is required");
    if (!Number.isInteger(onHand) || onHand < 0) return setErr("On hand must be an integer >= 0");
    if (!Number.isInteger(reorderPoint) || reorderPoint < 0) return setErr("Reorder point must be an integer >= 0");
    if (!Number.isInteger(reorderQty) || reorderQty < 0) return setErr("Reorder qty must be an integer >= 0");

    try {
      await api.upsertProduct({ sku, name, onHand, reorderPoint, reorderQty });
      setMsg("Saved product ✅");
      setDraft({ sku: "", name: "", onHand: "0", reorderPoint: "0", reorderQty: "0" });
      await reload();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  function loadIntoForm(p: Product) {
    setDraft({
      sku: p.sku,
      name: p.name,
      onHand: String(p.onHand),
      reorderPoint: String(p.reorderPoint),
      reorderQty: String(p.reorderQty)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <h3>Inventory</h3>

      <div style={{ border: "1px solid #3333", padding: 12, marginTop: 12 }}>
        <b>Add / Update product</b>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, marginTop: 10 }}>
          <label>SKU</label>
          <input
            value={draft.sku}
            onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
            placeholder="e.g. PPU-2"
          />

          <label>Name</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Power Bank 20,000mAh"
          />

          <label>On hand</label>
          <input
            value={draft.onHand}
            onChange={(e) => setDraft((d) => ({ ...d, onHand: e.target.value }))}
            inputMode="numeric"
          />

          <label>Reorder point</label>
          <input
            value={draft.reorderPoint}
            onChange={(e) => setDraft((d) => ({ ...d, reorderPoint: e.target.value }))}
            inputMode="numeric"
          />

          <label>Reorder qty</label>
          <input
            value={draft.reorderQty}
            onChange={(e) => setDraft((d) => ({ ...d, reorderQty: e.target.value }))}
            inputMode="numeric"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={saveProduct}>Save</button>
          <button
            onClick={() =>
              setDraft({ sku: "", name: "", onHand: "0", reorderPoint: "0", reorderQty: "0" })
            }
          >
            Clear
          </button>
          <button onClick={reload} disabled={loading}>
            Refresh
          </button>
        </div>

        {err && <div style={{ marginTop: 10, padding: 10, border: "1px solid #f66" }}>{err}</div>}
        {msg && <div style={{ marginTop: 10, padding: 10, border: "1px solid #6f6" }}>{msg}</div>}
      </div>

      {loading ? (
        <p style={{ marginTop: 12 }}>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th align="left">SKU</th>
              <th align="left">Name</th>
              <th align="right">On hand</th>
              <th align="right">Reorder point</th>
              <th align="right">Reorder qty</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.sku} style={{ borderTop: "1px solid #3333" }}>
                <td>
                  <code>{p.sku}</code>
                </td>
                <td>{p.name}</td>
                <td align="right">{p.onHand}</td>
                <td align="right">{p.reorderPoint}</td>
                <td align="right">{p.reorderQty}</td>
                <td>
                  <button onClick={() => adjust(p.sku, -1)}>-1</button>{" "}
                  <button onClick={() => adjust(p.sku, +1)}>+1</button>{" "}
                  <button onClick={() => loadIntoForm(p)}>Edit</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ paddingTop: 10, opacity: 0.8 }}>
                  No products yet — add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
