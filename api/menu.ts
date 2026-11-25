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
    // Reuse this existing serverless function for menu and subscription-status
    // routes so the Hobby plan function-count limit is not exceeded.
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const apiPath = parsedUrl.searchParams.get("__apiPath");
    const menuPath = parsedUrl.searchParams.get("__menuPath");

    if (apiPath !== null) {
      const cleanPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
      parsedUrl.searchParams.delete("__apiPath");
      const query = parsedUrl.searchParams.toString();
      req.url = `${cleanPath}${query ? `?${query}` : ""}`;
    } else if (menuPath !== null) {
      const cleanPath = menuPath.replace(/^\/+/, "");
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
    console.error("Failed to initialize Unsay Sud-an API:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "API initialization failed." });
    }
  }
}
