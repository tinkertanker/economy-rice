import { ensureTestDatabase } from "./helpers/test-database.js";

export default function setup() {
  const managed = ensureTestDatabase();
  process.env.DATABASE_URL = managed.url;
  return () => {
    managed.cleanup();
  };
}
