import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

export const leaderboardRoutes = new Elysia({ prefix: "/leaderboard" })
  .get("/", () => {
    return db
      .select({
        username: schema.users.username,
        totalScore: schema.leaderboard.totalScore,
        missionsCompleted: schema.leaderboard.missionsCompleted,
      })
      .from(schema.leaderboard)
      .innerJoin(
        schema.users,
        eq(schema.leaderboard.userId, schema.users.id)
      )
      .orderBy(desc(schema.leaderboard.totalScore))
      .limit(50)
      .all();
  })
  .use(requireAuth)
  .get("/me", ({ userId }) => {
    const uid = Number(userId);

    const entry = db
      .select({
        totalScore: schema.leaderboard.totalScore,
        missionsCompleted: schema.leaderboard.missionsCompleted,
      })
      .from(schema.leaderboard)
      .where(eq(schema.leaderboard.userId, uid))
      .get();

    const progress = db
      .select()
      .from(schema.userProgress)
      .where(eq(schema.userProgress.userId, uid))
      .all();

    return { ...entry, progress };
  });
