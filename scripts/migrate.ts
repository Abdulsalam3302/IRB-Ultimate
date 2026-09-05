import "dotenv/config";
import { runMigrations } from "../server/migrate";
runMigrations().catch(() => { console.error("Migration failed. Inspect the database and migration journal before retrying."); process.exitCode = 1; });
