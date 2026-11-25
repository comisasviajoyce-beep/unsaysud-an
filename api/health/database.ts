import type { RowDataPacket } from "mysql2";
import {
  getDatabasePool,
  getMissingDatabaseEnvironment
} from "../../src/server/config/database";

export async function GET(): Promise<Response> {
  const missing = getMissingDatabaseEnvironment();

  if (missing.length > 0) {
    return Response.json(
      {
        status: "error",
        database: "not_configured",
        missing
      },
      { status: 503 }
    );
  }

  try {
    const [rows] = await getDatabasePool().query<RowDataPacket[]>(
      "SELECT 1 AS connection_ok"
    );

    if (Number(rows[0]?.connection_ok) !== 1) {
      throw new Error("Unexpected database health-check result.");
    }

    return Response.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Keep provider details and credentials out of the public health response.
    console.error("[database-health] MySQL connection check failed:", error);

    return Response.json(
      {
        status: "error",
        database: "unavailable",
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
