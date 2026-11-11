import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Read from local .env.local file first for local schema migration tasks
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config(); // fallback to .env if present

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  if (process.env.SQL_HOST && process.env.SQL_DB_NAME) {
    const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'postgres';
    const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || '';
    const database = process.env.SQL_DB_NAME;
    const host = process.env.SQL_HOST;
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost/${database}?host=${encodeURIComponent(host)}`;
  }
  return "";
}

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  throw new Error("DATABASE_URL or SQL_HOST/SQL_DB_NAME must be set in environment variables.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
});
