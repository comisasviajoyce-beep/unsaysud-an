import { createRequire } from "node:module";
import type { Request, Response } from "express";
import type { Express } from "express";

const require = createRequire(import.meta.url);
const { createApp } = require("../../dist/server.cjs") as {
  createApp: () => Promise<Express>;
};

// Route all stalls endpoints through the shared Express API and MySQL persistence layer.
let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Failed to initialize Unsay Sud-an stalls API:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Stalls API initialization failed." });
    }
  }
}
