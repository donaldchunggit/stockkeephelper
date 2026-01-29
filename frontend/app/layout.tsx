import "./globals.css";

export const metadata = {
  title: "Snap Ops",
  description: "Inventory + Orders ops dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
          <header style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <h1 style={{ margin: 0 }}>Snap Ops</h1>
            <nav style={{ display: "flex", gap: 12 }}>
              <a href="/">Orders</a>
              <a href="/inventory">Inventory</a>
              <a href="/alerts">Low Stock</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
