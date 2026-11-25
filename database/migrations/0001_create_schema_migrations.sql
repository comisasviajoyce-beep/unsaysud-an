-- Bootstrap migration registry only.
-- Business tables are intentionally deferred until the ERD and TypeScript-to-SQL
-- mapping have been reviewed. This migration does not import or modify app data.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
