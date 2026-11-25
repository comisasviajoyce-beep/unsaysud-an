import { createRequire } from "node:module";
import type { Request, Response } from "express";
import type { Express } from "express";

const require = createRequire(import.meta.url);
const { createApp } = require("../../dist/server.cjs") as {
  createApp: () => Promise<Express>;
};

// One Vercel function serves all /api/auth/* endpoints.
let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Failed to initialize Unsay Sud-an authentication API:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Authentication API initialization failed." });
    }
  }
}
