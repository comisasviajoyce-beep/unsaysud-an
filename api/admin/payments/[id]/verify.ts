import { createRequire } from "node:module";
import type { Request, Response } from "express";
import type { Express } from "express";

const require = createRequire(import.meta.url);
const { createApp } = require("../../../../dist/server.cjs") as {
  createApp: () => Promise<Express>;
};

let appPromise: ReturnType<typeof createApp> | undefined;

// Explicit Vercel function for the critical payment verification route.
// The Express app retains responsibility for session validation and business logic.
export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Payment verification function failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Payment verification service initialization failed." });
    }
  }
}
