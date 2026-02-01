import { parse } from "csv-parse/sync";
import { db } from "./db.js";
import { recomputeLowStockAlerts } from "./alerts.js";

function nowIso() {
  return new Date().toISOString();
}

function norm(s: any) {
  return String(s ?? "").trim();
}

// Pull a value from row using any of these header candidates
function pick(row: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    if (k in row) return row[k];
  }
  return undefined;
}

function toInt(v: any, fallback = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/* -------------------- Products CSV --------------------
Accepts headers like:
- SKU / Variant SKU / sku
- Title / Name / Product title
- On hand / Available / Inventory quantity / onHand
- Reorder point / reorder_point
- Reorder qty / reorder_qty
------------------------------------------------------- */
export function importProductsCsv(csvText: string) {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true
  }) as Array<Record<string, any>>;

  const t = nowIso();

  const upsert = db.prepare(`
    INSERT INTO products (sku, name, on_hand, reorder_point, reorder_qty, updated_at)
    VALUES (@sku, @name, @onHand, @reorderPoint, @reorderQty, @t)
    ON CONFLICT(sku) DO UPDATE SET
      name=excluded.name,
      on_hand=excluded.on_hand,
      reorder_point=excluded.reorder_point,
      reorder_qty=excluded.reorder_qty,
      updated_at=excluded.updated_at
  `);

  const tx = db.transaction(() => {
    let imported = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const sku = norm(pick(r, ["SKU", "Variant SKU", "sku", "variant_sku"]));
      const name = norm(pick(r, ["Name", "Title", "Product Title", "product_title"]));

      if (!sku) {
        errors.push({ row: i + 2, reason: "Missing SKU" });
        continue;
      }
      if (!name) {
        // allow blank name but keep something usable
        // (you can tighten this later)
      }

      const onHand = toInt(pick(r, ["On hand", "Available", "Inventory quantity", "onHand", "on_hand"]), 0);
      const reorderPoint = toInt(pick(r, ["Reorder point", "reorder_point", "reorderPoint"]), 0);
      const reorderQty = toInt(pick(r, ["Reorder qty", "reorder_qty", "reorderQty"]), 0);

      upsert.run({
        sku,
        name: name || sku,
        onHand,
        reorderPoint,
        reorderQty,
        t
      });
      imported++;
    }

    recomputeLowStockAlerts(t);
    return { imported, errors };
  });

  return tx();
}

/* -------------------- Orders CSV --------------------
Best case: Shopify Orders export includes line items per row.
We’ll accept either:
A) One CSV where each row is an item line with same order #
B) Two CSVs: orders.csv and items.csv (optional later)

For now: single CSV that includes:
- Order / Name / order_number
- Customer name
- Lineitem sku + quantity (or Variant SKU + Lineitem quantity)

------------------------------------------------------ */
export function importOrdersCsv(csvText: string) {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true
  }) as Array<Record<string, any>>;

  const t = nowIso();

  const upsertOrder = db.prepare(`
    INSERT INTO orders (shopify_order_number, customer_name, status, notes, created_at, updated_at)
    VALUES (@shopifyOrderNumber, @customerName, @status, NULL, @createdAt, @updatedAt)
    ON CONFLICT(shopify_order_number) DO UPDATE SET
      customer_name=excluded.customer_name,
      status=excluded.status,
      updated_at=excluded.updated_at
  `);

  const findOrderId = db.prepare(`SELECT id FROM orders WHERE shopify_order_number=?`);
  const deleteItems = db.prepare(`DELETE FROM order_items WHERE order_id=?`);
  const insertItem = db.prepare(`INSERT INTO order_items (order_id, sku, qty) VALUES (?, ?, ?)`);

  const tx = db.transaction(() => {
    // group items by order number
    const grouped = new Map<
      string,
      { customerName: string | null; status: string; createdAt: string; updatedAt: string; items: Array<{ sku: string; qty: number }> }
    >();

    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // Shopify often uses "Name" like "#1234"
      const rawOrder = norm(pick(r, ["Name", "Order", "Order Name", "order", "order_number", "Order Number"]));
      const shopifyOrderNumber = rawOrder.replace("#", "");

      if (!shopifyOrderNumber) {
        errors.push({ row: i + 2, reason: "Missing order number" });
        continue;
      }

      const customerName = norm(
        pick(r, ["Customer", "Customer Name", "Billing Name", "Shipping Name", "customer_name"])
      ) || null;

      const status = norm(pick(r, ["Fulfillment Status", "Fulfillment status", "status"])) || "ORDERED";

      const createdAt = norm(pick(r, ["Created at", "Created At", "created_at"])) || t;
      const updatedAt = norm(pick(r, ["Updated at", "Updated At", "updated_at"])) || t;

      const sku = norm(pick(r, ["Lineitem sku", "Line Item SKU", "Variant SKU", "SKU", "sku"]));
      const qty = toInt(pick(r, ["Lineitem quantity", "Line Item Quantity", "Quantity", "qty"]), 1);

      if (!grouped.has(shopifyOrderNumber)) {
        grouped.set(shopifyOrderNumber, {
          customerName,
          status,
          createdAt,
          updatedAt,
          items: []
        });
      }

      // only add item if SKU exists
      if (sku) {
        grouped.get(shopifyOrderNumber)!.items.push({ sku, qty: Math.max(qty, 1) });
      }
    }

    let importedOrders = 0;

    for (const [orderNum, data] of grouped.entries()) {
      upsertOrder.run({
        shopifyOrderNumber: orderNum,
        customerName: data.customerName,
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });

      const local = findOrderId.get(orderNum) as { id: number };
      deleteItems.run(local.id);

      for (const it of data.items) {
        insertItem.run(local.id, it.sku, it.qty);
      }

      importedOrders++;
    }

    recomputeLowStockAlerts(t);
    return { importedOrders, errors };
  });

  return tx();
}
