import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createApp } = require("../../dist/server.cjs");

let appPromise;

export default async function handler(req, res) {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("Failed to initialize Unsay Sud-an auth API:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "API initialization failed." });
    }
  }
}
