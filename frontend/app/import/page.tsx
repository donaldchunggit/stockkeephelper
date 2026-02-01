"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";

async function upload(endpoint: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    body: fd
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

export default function ImportPage() {
  const [products, setProducts] = useState<File | null>(null);
  const [orders, setOrders] = useState<File | null>(null);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(type: "products" | "orders") {
    setErr(null);
    setOut(null);

    const file = type === "products" ? products : orders;
    if (!file) return setErr("Select a CSV first");

    try {
      const result = await upload(
        type === "products" ? "/import/products" : "/import/orders",
        file
      );
      setOut(result);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  return (
    <div>
      <h3>Import Shopify CSV</h3>

      <div style={{ marginTop: 12 }}>
        <b>Products CSV</b>
        <div>
          <input type="file" accept=".csv" onChange={(e) => setProducts(e.target.files?.[0] ?? null)} />
          <button onClick={() => run("products")}>Import products</button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <b>Orders CSV</b>
        <div>
          <input type="file" accept=".csv" onChange={(e) => setOrders(e.target.files?.[0] ?? null)} />
          <button onClick={() => run("orders")}>Import orders</button>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: "red" }}>{err}</div>}
      {out && (
        <pre style={{ marginTop: 12, padding: 10, border: "1px solid #ccc" }}>
          {JSON.stringify(out, null, 2)}
        </pre>
      )}
    </div>
  );
}
