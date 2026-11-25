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
    // Vercel rewrites every /api/menu/* request to this single function and
    // carries the original nested path in __menuPath.
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const routedPath = parsedUrl.searchParams.get("__menuPath");
    if (routedPath !== null) {
      const cleanPath = routedPath.replace(/^\/+/, "");
      parsedUrl.searchParams.delete("__menuPath");
      const query = parsedUrl.searchParams.toString();
      req.url = `/api/menu${cleanPath ? `/${cleanPath}` : ""}${query ? `?${query}` : ""}`;
    } else if (!parsedUrl.pathname.startsWith("/api/menu")) {
      req.url = `/api/menu${parsedUrl.pathname.startsWith("/") ? parsedUrl.pathname : `/${parsedUrl.pathname}`}${parsedUrl.search}`;
    }

    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Failed to initialize Unsay Sud-an menu API:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Menu API initialization failed." });
    }
  }
}
