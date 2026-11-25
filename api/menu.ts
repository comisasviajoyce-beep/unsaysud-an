import { createRequire } from "node:module";
import type { Request, Response } from "express";
import type { Express } from "express";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/server.cjs") as {
  createApp: () => Promise<Express>;
};

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    const requestUrl = req.url || "/";
    if (!requestUrl.startsWith("/api/menu")) {
      req.url = `/api/menu${requestUrl.startsWith("/") ? requestUrl : `/${requestUrl}`}`;
    }
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Failed to initialize Unsay Sud-an menu API:", error);
    if (!res.headersSent) res.status(500).json({ error: "Menu API initialization failed." });
  }
}
