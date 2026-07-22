import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Bind a D1 database as `DB` before using the database."
    );
  }

  return drizzle(database, { schema });
}
