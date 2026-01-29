import Database from "better-sqlite3";

export const db = new Database("ops.sqlite");

export function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      on_hand INTEGER NOT NULL DEFAULT 0,
      reorder_point INTEGER NOT NULL DEFAULT 0,
      reorder_qty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT,
      status TEXT NOT NULL DEFAULT 'ORDERED', -- ORDERED|PACKED|SHIPPED|DELIVERED|RETURNED|FAULTY
      tracking_url TEXT,
      tracking_number TEXT,
      courier TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      qty INTEGER NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(sku) REFERENCES products(sku)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      type TEXT NOT NULL, -- LOW_STOCK
      is_active INTEGER NOT NULL DEFAULT 1,
      triggered_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE(sku, type),
      FOREIGN KEY(sku) REFERENCES products(sku)
    );
  `);
}
