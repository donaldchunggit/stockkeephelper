import { db } from "./db";

/**
 * For now: compute low-stock alerts and store in DB.
 * Later: this is where you'll call Slack.
 */
export function recomputeLowStockAlerts(nowIso: string) {
  const products = db
    .prepare(
      `SELECT sku, name, on_hand as onHand, reorder_point as reorderPoint, reorder_qty as reorderQty
       FROM products`
    )
    .all() as Array<{ sku: string; name: string; onHand: number; reorderPoint: number; reorderQty: number }>;

  const upsertAlert = db.prepare(`
    INSERT INTO alerts (sku, type, is_active, triggered_at)
    VALUES (@sku, 'LOW_STOCK', 1, @now)
    ON CONFLICT(sku, type)
    DO UPDATE SET is_active=1, resolved_at=NULL
  `);

  const resolveAlert = db.prepare(`
    UPDATE alerts
    SET is_active=0, resolved_at=@now
    WHERE sku=@sku AND type='LOW_STOCK'
  `);

  for (const p of products) {
    const isLow = p.onHand <= p.reorderPoint;
    if (isLow) {
      upsertAlert.run({ sku: p.sku, now: nowIso });
      // later: sendSlackLowStock(p)
    } else {
      resolveAlert.run({ sku: p.sku, now: nowIso });
    }
  }
}
