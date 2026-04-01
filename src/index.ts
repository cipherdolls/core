import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { authRoutes } from "./routes/auth.routes";
import { dollsRoutes } from "./routes/dolls.routes";
import { missionsRoutes } from "./routes/missions.routes";
import { leaderboardRoutes } from "./routes/leaderboard.routes";
import { seed } from "./db/seed";

// Run migrations and seed
import { db, schema } from "./db";
import { Database } from "bun:sqlite";

// Create tables if they don't exist
const sqlite = new Database(process.env.DB_PATH ?? "cipher_dolls.db");
sqlite.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    codename TEXT NOT NULL UNIQUE,
    description TEXT,
    cipher_type TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    image_url TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    doll_id INTEGER NOT NULL REFERENCES dolls(id),
    encrypted_message TEXT NOT NULL,
    solution TEXT NOT NULL,
    hint TEXT,
    reward INTEGER NOT NULL DEFAULT 10,
    difficulty INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    mission_id INTEGER NOT NULL REFERENCES missions(id),
    completed INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    total_score INTEGER NOT NULL DEFAULT 0,
    missions_completed INTEGER NOT NULL DEFAULT 0,
    rank INTEGER
  );
`);
sqlite.close(false);

// Seed default data
seed();

const app = new Elysia()
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "Cipher Dolls API",
          version: "1.0.0",
          description:
            "Backend API for Cipher Dolls - a cryptography puzzle game featuring collectible dolls and cipher missions.",
        },
        tags: [
          { name: "Auth", description: "Authentication endpoints" },
          { name: "Dolls", description: "Cipher Doll management" },
          { name: "Missions", description: "Cipher mission challenges" },
          { name: "Leaderboard", description: "Player rankings" },
        ],
      },
    })
  )
  .get("/", () => ({
    name: "Cipher Dolls API",
    version: "1.0.0",
    status: "operational",
  }))
  .use(authRoutes)
  .use(dollsRoutes)
  .use(missionsRoutes)
  .use(leaderboardRoutes)
  .listen(process.env.PORT ?? 3000);

console.log(
  `Cipher Dolls API running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(
  `Swagger docs at http://localhost:${app.server?.port}/swagger`
);

export type App = typeof app;
