"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Order, type OrderItem } from "../lib/api";

type ItemDraft = { sku: string; qty: string };

function toInt(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export default function OrdersPage() {
  const [rows, setRows] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create order form
  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ sku: "", qty: "1" }]);

  async function reload() {
    setErr(null);
    setLoading(true);
    try {
      setRows(await api.listOrders());
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function saveTracking(id: number, trackingInput: string) {
    setErr(null);
    setMsg(null);
    try {
      await api.updateOrder(id, { trackingInput });
      setMsg("Saved tracking ✅");
      await reload();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  function addItemRow() {
    setItems((prev) => [...prev, { sku: "", qty: "1" }]);
  }

  function removeItemRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const parsedItems: OrderItem[] = useMemo(() => {
    const out: OrderItem[] = [];
    for (const it of items) {
      const sku = it.sku.trim();
      const qty = toInt(it.qty);
      if (!sku) continue;
      if (!Number.isInteger(qty) || qty <= 0) continue;
      out.push({ sku, qty });
    }
    return out;
  }, [items]);

  async function createOrder() {
    setErr(null);
    setMsg(null);

    const shopifyOrderNumber = orderNumber.trim();
    if (!shopifyOrderNumber) return setErr("Order number is required (Shopify order # or your ref)");
    if (parsedItems.length === 0) return setErr("Add at least 1 valid item (SKU + qty)");

    try {
      await api.createOrder({
        shopifyOrderNumber,
        customerName: customerName.trim() || undefined,
        notes: notes.trim() || undefined,
        items: parsedItems
      });

      setMsg("Created order ✅");
      setOrderNumber("");
      setCustomerName("");
      setNotes("");
      setItems([{ sku: "", qty: "1" }]);
      await reload();
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  return (
    <div>
      <h3>Orders</h3>

      <div style={{ border: "1px solid #3333", padding: 12, marginTop: 12 }}>
        <b>Create order</b>

        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginTop: 10 }}>
          <label>Order number</label>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="e.g. 12345 (Shopify #) or SW-123"
          />

          <label>Customer name (optional)</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />

          <label>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ marginTop: 12 }}>
          <b>Items</b>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 8 }}>
                <input
                  placeholder="SKU"
                  value={it.sku}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, sku: e.target.value } : x))
                    )
                  }
                />
                <input
                  placeholder="Qty"
                  inputMode="numeric"
                  value={it.qty}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, qty: e.target.value } : x))
                    )
                  }
                />
                <button onClick={() => removeItemRow(i)} disabled={items.length === 1}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={addItemRow}>Add item</button>
            <button onClick={createOrder}>Create</button>
            <button onClick={reload} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {err && <div style={{ marginTop: 10, padding: 10, border: "1px solid #f66" }}>{err}</div>}
        {msg && <div style={{ marginTop: 10, padding: 10, border: "1px solid #6f6" }}>{msg}</div>}
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h4 style={{ marginTop: 0 }}>Existing orders</h4>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((o) => (
            <div key={o.id} style={{ border: "1px solid #3333", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <b>#{o.shopifyOrderNumber}</b> — {o.customerName ?? "Unknown"} —{" "}
                  <code>{o.status}</code>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>
                    Items:{" "}
                    {o.items.map((it) => `${it.sku}×${it.qty}`).join(", ") || "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {o.trackingUrl ? (
                    <a href={o.trackingUrl} target="_blank" rel="noreferrer">
                      Tracking link
                    </a>
                  ) : (
                    <span style={{ opacity: 0.7 }}>No tracking</span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input
                  placeholder="Paste tracking URL or tracking number"
                  defaultValue={o.trackingUrl ?? o.trackingNumber ?? ""}
                  style={{ flex: 1, padding: 8 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveTracking(o.id, (e.target as HTMLInputElement).value);
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement;
                    saveTracking(o.id, input.value);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div style={{ opacity: 0.8 }}>No orders yet — create one above.</div>
          )}
        </div>
      )}
    </div>
  );
}
