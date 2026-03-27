import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const dolls = sqliteTable("dolls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  codename: text("codename").notNull().unique(),
  description: text("description"),
  cipherType: text("cipher_type").notNull(), // e.g. "substitution", "transposition", "aes", "rsa"
  difficulty: integer("difficulty").notNull().default(1), // 1-5
  status: text("status", { enum: ["active", "inactive", "retired"] })
    .notNull()
    .default("active"),
  imageUrl: text("image_url"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const missions = sqliteTable("missions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  dollId: integer("doll_id")
    .notNull()
    .references(() => dolls.id),
  encryptedMessage: text("encrypted_message").notNull(),
  solution: text("solution").notNull(),
  hint: text("hint"),
  reward: integer("reward").notNull().default(10),
  difficulty: integer("difficulty").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const userProgress = sqliteTable("user_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  missionId: integer("mission_id")
    .notNull()
    .references(() => missions.id),
  completed: integer("completed", { mode: "boolean" })
    .notNull()
    .default(false),
  attempts: integer("attempts").notNull().default(0),
  score: integer("score").notNull().default(0),
  completedAt: text("completed_at"),
});

export const leaderboard = sqliteTable("leaderboard", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  totalScore: integer("total_score").notNull().default(0),
  missionsCompleted: integer("missions_completed").notNull().default(0),
  rank: integer("rank"),
});
