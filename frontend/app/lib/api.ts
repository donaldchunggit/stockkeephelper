const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // orders
  listOrders: () => fetch(`${API_BASE}/orders`).then(json<any[]>),
  createOrder: (payload: any) =>
    fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(json),
  updateOrder: (id: number, payload: any) =>
    fetch(`${API_BASE}/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(json),

  // inventory
  listProducts: () => fetch(`${API_BASE}/products`).then(json<any[]>),
  upsertProduct: (payload: any) =>
    fetch(`${API_BASE}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(json),
  adjustStock: (sku: string, delta: number) =>
    fetch(`${API_BASE}/products/${encodeURIComponent(sku)}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta })
    }).then(json),

  // alerts
  lowStockAlerts: () => fetch(`${API_BASE}/alerts/low-stock`).then(json<any[]>)
};
