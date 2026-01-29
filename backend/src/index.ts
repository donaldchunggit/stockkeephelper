import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import { router } from "./routes.js";

initDb();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.use("/api", router);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
