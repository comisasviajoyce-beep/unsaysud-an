import { createRequire } from "node:module";
import type { Request, Response } from "express";
import type { Express } from "express";

const require = createRequire(import.meta.url);
const { createApp } = require("../../../dist/server.cjs") as {
  createApp: () => Promise<Express>;
};

// Explicit Vercel route for the merchant subscription-status endpoint.
// Keep the request URL intact so Express can apply its authentication checks
// and match /api/subscription/status/:stallName.
let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Failed to initialize subscription status API:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Subscription status API initialization failed." });
    }
  }
}
