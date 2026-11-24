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

  return databasePool;
}


/**
 * Durable JSON document storage for application domains that are naturally
 * represented as versioned snapshots (menu, sales, analytics, etc.).
 * MySQL is authoritative; process memory is only a cache.
 */
let appDataDocumentStoreReady = false;
let appDataWriteQueue: Promise<void> = Promise.resolve();
let appDataWriteError: unknown = null;

export async function initializeAppDataDocumentStore(): Promise<void> {
  if (appDataDocumentStoreReady) return;
  const pool = getDatabasePool();
  await pool.query(`CREATE TABLE IF NOT EXISTS app_data_documents (
    document_key VARCHAR(120) NOT NULL PRIMARY KEY,
    document_value JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_media (
    media_id VARCHAR(160) NOT NULL PRIMARY KEY,
    mime_type VARCHAR(100) NOT NULL,
    media_data LONGBLOB NOT NULL,
    owner_id VARCHAR(160) NOT NULL,
    visibility ENUM("public", "private") NOT NULL DEFAULT "private",
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_app_media_owner (owner_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  appDataDocumentStoreReady = true;
}

export async function loadAppDataDocument<T>(key: string, fallback: T): Promise<T> {
  if (!appDataDocumentStoreReady) {
    throw new Error("Application data document store has not been initialized.");
  }
  const pool = getDatabasePool();
  const [rows] = await pool.query<any[]>(
    "SELECT document_value FROM app_data_documents WHERE document_key = ? LIMIT 1",
    [key]
  );
  if (rows.length > 0) {
    const value = rows[0].document_value;
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  }
  await pool.execute(
    "INSERT INTO app_data_documents (document_key, document_value) VALUES (?, ?)",
    [key, JSON.stringify(fallback)]
  );
  return fallback;
}

export function queueAppDataDocumentWrite(key: string, value: unknown): void {
  if (!appDataDocumentStoreReady) return;
  const serialized = JSON.stringify(value);
  appDataWriteQueue = appDataWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const pool = getDatabasePool();
      await pool.execute(
        `INSERT INTO app_data_documents (document_key, document_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE document_value = VALUES(document_value)`,
        [key, serialized]
      );
    })
    .catch(error => {
      appDataWriteError = error;
      console.error("Failed to persist application data document:", key, error);
    });
}

export async function flushAppDataDocumentWrites(): Promise<void> {
  await appDataWriteQueue;
  if (appDataWriteError) {
    const error = appDataWriteError;
    appDataWriteError = null;
    throw error;
  }
}


export async function saveAppMedia(
  mediaId: string,
  mimeType: string,
  data: Buffer,
  ownerId: string,
  visibility: "public" | "private"
): Promise<void> {
  const pool = getDatabasePool();
  await pool.execute(
    `INSERT INTO app_media (media_id, mime_type, media_data, owner_id, visibility)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type),
       media_data = VALUES(media_data), owner_id = VALUES(owner_id),
       visibility = VALUES(visibility)`,
    [mediaId, mimeType, data, ownerId, visibility]
  );
}

export async function getAppMedia(mediaId: string): Promise<{
  mimeType: string;
  data: Buffer;
  ownerId: string;
  visibility: "public" | "private";
} | null> {
  const pool = getDatabasePool();
  const [rows] = await pool.query<any[]>(
    "SELECT mime_type, media_data, owner_id, visibility FROM app_media WHERE media_id = ? LIMIT 1",
    [mediaId]
  );
  if (!rows.length) return null;
  return {
    mimeType: rows[0].mime_type,
    data: Buffer.isBuffer(rows[0].media_data) ? rows[0].media_data : Buffer.from(rows[0].media_data),
    ownerId: rows[0].owner_id,
    visibility: rows[0].visibility
  };
}

export async function deleteAppMedia(mediaId: string): Promise<void> {
  const pool = getDatabasePool();
  await pool.execute("DELETE FROM app_media WHERE media_id = ?", [mediaId]);
}
