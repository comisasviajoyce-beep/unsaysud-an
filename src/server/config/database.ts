import { attachDatabasePool } from "@vercel/functions";
import { createPool, type Pool } from "mysql2/promise";

let databasePool: Pool | undefined;

function getDatabaseEnvironment() {
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || "",
    port: process.env.DB_PORT || process.env.MYSQLPORT || "3306",
    user: process.env.DB_USER || process.env.MYSQLUSER || "",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "",
    ssl: process.env.DB_SSL === "true",
    connectionLimit: process.env.DB_CONNECTION_LIMIT || "3"
  };
}

export function getMissingDatabaseEnvironment(): string[] {
  const config = getDatabaseEnvironment();
  const missing: string[] = [];

  if (!config.host) missing.push("DB_HOST (or MYSQLHOST)");
  if (!config.user) missing.push("DB_USER (or MYSQLUSER)");
  if (!config.password) missing.push("DB_PASSWORD (or MYSQLPASSWORD)");
  if (!config.database) missing.push("DB_NAME (or MYSQLDATABASE)");

  return missing;
}

/**
 * Lazily creates one pool per Vercel function instance.
 * Never import this module into browser/client-side code.
 */
export function getDatabasePool(): Pool {
  if (databasePool) return databasePool;

  const missing = getMissingDatabaseEnvironment();
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(", ")}`);
  }

  const config = getDatabaseEnvironment();
  const port = Number(config.port);
  const connectionLimit = Number(config.connectionLimit);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port.");
  }
  if (!Number.isInteger(connectionLimit) || connectionLimit < 2 || connectionLimit > 10) {
    throw new Error("DB_CONNECTION_LIMIT must be an integer between 2 and 10.");
  }

  databasePool = createPool({
    host: config.host,
    port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit,
    maxIdle: 1,
    idleTimeout: 5000,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {})
  });

  // Vercel uses this hook to close idle MySQL connections before a function suspends.
  attachDatabasePool(databasePool);

  return databasePool;
}
