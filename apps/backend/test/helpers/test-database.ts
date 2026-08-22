import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ManagedDatabase = {
  url: string;
  cleanup: () => void;
};

function postgresBinDirs(): string[] {
  const dirs = [process.env.POSTGRES_BIN].filter((value): value is string => Boolean(value));
  const libRoot = "/usr/lib/postgresql";
  if (existsSync(libRoot)) {
    for (const version of readdirSync(libRoot).sort().reverse()) {
      dirs.push(join(libRoot, version, "bin"));
    }
  }
  return dirs.filter((dir) => existsSync(join(dir, "initdb")));
}

function commandPath(command: string): string | null {
  const extraPath = postgresBinDirs().join(":");
  const path = extraPath ? `${extraPath}:${process.env.PATH ?? ""}` : process.env.PATH;
  try {
    return execFileSync("which", [command], {
      env: { ...process.env, PATH: path },
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function runPostgres(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; stdio?: "ignore" } = {}) {
  const resolved = commandPath(command);
  if (!resolved) {
    throw new Error(`Missing required postgres binary for tests: ${command}`);
  }
  const extraPath = postgresBinDirs().join(":");
  execFileSync(resolved, args, {
    stdio: options.stdio ?? "ignore",
    env: {
      ...process.env,
      ...options.env,
      PATH: extraPath ? `${extraPath}:${process.env.PATH ?? ""}` : process.env.PATH,
    },
  });
}

export function ensureTestDatabase(): ManagedDatabase {
  if (process.env.DATABASE_URL) {
    return {
      url: process.env.DATABASE_URL,
      cleanup: () => undefined,
    };
  }

  const required = ["initdb", "pg_ctl", "createdb", "pg_isready"];
  for (const binary of required) {
    if (!commandPath(binary)) {
      throw new Error(`Missing required postgres binary for tests: ${binary}`);
    }
  }

  const baseDir = mkdtempSync(join(tmpdir(), "points-accelerator-pg-"));
  const dataDir = join(baseDir, "data");
  const socketDir = join(baseDir, "socket");
  const logFile = join(baseDir, "postgres.log");
  const port = String(55432 + Math.floor(Math.random() * 1000));

  mkdirSync(socketDir, { recursive: true });

  runPostgres("initdb", ["-A", "trust", "-U", "postgres", "-D", dataDir], {
    env: { LC_ALL: "C" },
  });
  // unix_socket_directories must be writable. Debian packages default to
  // /var/run/postgresql, which this process cannot create lock files in.
  runPostgres("pg_ctl", ["-D", dataDir, "-l", logFile, "-o", `-F -p ${port} -k ${socketDir}`, "start"]);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      runPostgres("pg_isready", ["-h", "127.0.0.1", "-p", port, "-U", "postgres"]);
      break;
    } catch (error) {
      if (attempt === 19) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }

  runPostgres("createdb", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "points_accelerator_test"]);

  const url = `postgresql://postgres@127.0.0.1:${port}/points_accelerator_test?schema=public`;
  process.env.DATABASE_URL = url;

  execFileSync(
    join(process.cwd(), "../../node_modules/.bin/prisma"),
    ["migrate", "deploy", "--schema", "prisma/schema.prisma"],
    {
      cwd: join(process.cwd()),
      env: {
        ...process.env,
        DATABASE_URL: url,
      },
      stdio: "ignore",
    },
  );

  return {
    url,
    cleanup: () => {
      try {
        runPostgres("pg_ctl", ["-D", dataDir, "stop", "-m", "immediate"]);
      } finally {
        if (existsSync(baseDir)) {
          rmSync(baseDir, { recursive: true, force: true });
        }
      }
    },
  };
}
