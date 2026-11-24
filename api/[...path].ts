import type { Request, Response } from "express";
import { createApp } from "../server";

// Reuse one initialized Express application for warm serverless invocations.
let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
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
