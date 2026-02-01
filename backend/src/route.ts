import { Router, type Request, type Response } from "express";
import multer from "multer";

import { db } from "./db";
import { ProductUpsertSchema, OrderCreateSchema, OrderUpdateSchema } from "./validate";
import { parseTracking } from "./tracking";
import { recomputeLowStockAlerts } from "./alerts";
import { importOrdersCsv, importProductsCsv } from "./importers";

export const router = Router();

function nowIso() {
  return new Date().toISOString();
}

/* -------------------- Health -------------------- */

router.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

/* -------------------- Products / Inventory -------------------- */

// List products
router.get("/products", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT sku, name, on_hand as onHand, reorder_point as reorderPoint, reorder_qty as reorderQty, updated_at as updatedAt
       FROM products
       ORDER BY name`
    )
    .all();
  res.json(rows);
});

// Upsert product
router.post("/products", (req: Request, res: Response) => {
  const parsed = ProductUpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const t = nowIso();
  const p = parsed.data;

  db.prepare(`
    INSERT INTO products (sku, name, on_hand, reorder_point, reorder_qty, updated_at)
    VALUES (@sku, @name, @onHand, @reorderPoint, @reorderQty, @t)
    ON CONFLICT(sku)
    DO UPDATE SET
      name=excluded.name,
      on_hand=excluded.on_hand,
      reorder_point=excluded.reorder_point,
      reorder_qty=excluded.reorder_qty,
      updated_at=excluded.updated_at
  `).run({ ...p, t });

  recomputeLowStockAlerts(t);
  res.json({ ok: true });
});

// Adjust stock (increment/decrement)
router.post("/products/:sku/adjust", (req: Request, res: Response) => {
  const sku = String(req.params.sku);
  const delta = Number(req.body?.delta);
  if (!Number.isInteger(delta)) return res.status(400).json({ error: "delta must be an integer" });

  const t = nowIso();
  const row = db.prepare(`SELECT sku FROM products WHERE sku=?`).get(sku);
  if (!row) return res.status(404).json({ error: "SKU not found" });

  // clamp to >= 0 safely
  db.prepare(`
    UPDATE products
    SET on_hand = CASE
      WHEN on_hand + ? < 0 THEN 0
      ELSE on_hand + ?
    END,
    updated_at = ?
    WHERE sku = ?
  `).run(delta, delta, t, sku);

  recomputeLowStockAlerts(t);
  res.json({ ok: true });
});

/* -------------------- Orders -------------------- */

router.get("/orders", (_req: Request, res: Response) => {
  const orders = db
    .prepare(`
      SELECT id, shopify_order_number as shopifyOrderNumber, customer_name as customerName,
             status, tracking_url as trackingUrl, tracking_number as trackingNumber,
             courier, notes, created_at as createdAt, updated_at as updatedAt
      FROM orders
      ORDER BY created_at DESC
    `)
    .all();

  const itemsByOrder = new Map<number, Array<{ sku: string; qty: number }>>();
  const items = db
    .prepare(`
      SELECT order_id as orderId, sku, qty
      FROM order_items
    `)
    .all() as Array<{ orderId: number; sku: string; qty: number }>;

  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId)!.push({ sku: it.sku, qty: it.qty });
  }

  const withItems = (orders as any[]).map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] }));
  res.json(withItems);
});

router.post("/orders", (req: Request, res: Response) => {
  const parsed = OrderCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const t = nowIso();
  const o = parsed.data;

  const insertOrder = db.prepare(`
    INSERT INTO orders (shopify_order_number, customer_name, status, notes, created_at, updated_at)
    VALUES (@shopifyOrderNumber, @customerName, 'ORDERED', @notes, @t, @t)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, sku, qty)
    VALUES (@orderId, @sku, @qty)
  `);

  const tx = db.transaction(() => {
    const info = insertOrder.run({
      shopifyOrderNumber: o.shopifyOrderNumber,
      customerName: o.customerName ?? null,
      notes: o.notes ?? null,
      t
    });
    const orderId = Number(info.lastInsertRowid);

    for (const it of o.items) {
      insertItem.run({ orderId, sku: it.sku, qty: it.qty });
    }
    return orderId;
  });

  try {
    const orderId = tx();
    res.json({ ok: true, orderId });
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Order already exists" });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/orders/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = OrderUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = db.prepare(`SELECT id FROM orders WHERE id=?`).get(id);
  if (!existing) return res.status(404).json({ error: "Order not found" });

  const t = nowIso();
  const { status, notes, trackingInput } = parsed.data;

  let trackingUrl: string | null = null;
  let trackingNumber: string | null = null;
  let courier: string | null = null;

  if (typeof trackingInput === "string" && trackingInput.trim().length > 0) {
    const parsedTrack = parseTracking(trackingInput);
    trackingUrl = parsedTrack.trackingUrl;
    trackingNumber = parsedTrack.trackingNumber;
    courier = parsedTrack.courier;
  }

  const fields: string[] = [];
  const params: any[] = [];

  if (status) {
    fields.push(`status=?`);
    params.push(status);
  }
  if (typeof notes === "string") {
    fields.push(`notes=?`);
    params.push(notes);
  }
  if (trackingInput) {
    fields.push(`tracking_url=?`, `tracking_number=?`, `courier=?`);
    params.push(trackingUrl, trackingNumber, courier);
  }

  fields.push(`updated_at=?`);
  params.push(t);

  params.push(id);

  db.prepare(`UPDATE orders SET ${fields.join(", ")} WHERE id=?`).run(...params);
  res.json({ ok: true });
});

/* -------------------- Alerts -------------------- */

router.get("/alerts/low-stock", (_req: Request, res: Response) => {
  const rows = db
    .prepare(`
      SELECT a.sku, p.name, p.on_hand as onHand, p.reorder_point as reorderPoint, p.reorder_qty as reorderQty,
             a.is_active as isActive, a.triggered_at as triggeredAt
      FROM alerts a
      JOIN products p ON p.sku = a.sku
      WHERE a.type='LOW_STOCK' AND a.is_active=1
      ORDER BY p.on_hand ASC, p.name ASC
    `)
    .all();

  res.json(rows);
});

/* -------------------- CSV Import -------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/import/products", upload.single("file"), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Missing file" });

  const csvText = file.buffer.toString("utf-8");
  const result = importProductsCsv(csvText);

  res.json({ ok: true, ...result });
});

router.post("/import/orders", upload.single("file"), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Missing file" });

  const csvText = file.buffer.toString("utf-8");
  const result = importOrdersCsv(csvText);

  res.json({ ok: true, ...result });
});
