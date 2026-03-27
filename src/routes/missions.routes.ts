import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const missionsRoutes = new Elysia({ prefix: "/missions" })
  .get("/", () => {
    return db.select().from(schema.missions).all();
  })
  .get(
    "/:id",
    ({ params }) => {
      const mission = db
        .select()
        .from(schema.missions)
        .where(eq(schema.missions.id, params.id))
        .get();

      if (!mission) return { error: "Mission not found" };

      // Don't expose the solution in the response
      const { solution, ...rest } = mission;
      return rest;
    },
    { params: t.Object({ id: t.Number() }) }
  )
  .use(requireAuth)
  .post(
    "/:id/attempt",
    ({ params, body, userId }) => {
      const mission = db
        .select()
        .from(schema.missions)
        .where(eq(schema.missions.id, params.id))
        .get();

      if (!mission) return { error: "Mission not found" };

      const uid = Number(userId);

      // Get or create progress
      let progress = db
        .select()
        .from(schema.userProgress)
        .where(
          and(
            eq(schema.userProgress.userId, uid),
            eq(schema.userProgress.missionId, params.id)
          )
        )
        .get();

      if (!progress) {
        progress = db
          .insert(schema.userProgress)
          .values({ userId: uid, missionId: params.id })
          .returning()
          .get();
      }

      if (progress.completed) {
        return { message: "Mission already completed", score: progress.score };
      }

      // Increment attempts
      const attempts = progress.attempts + 1;
      const isCorrect =
        body.answer.toLowerCase().trim() ===
        mission.solution.toLowerCase().trim();

      if (isCorrect) {
        const score = Math.max(
          1,
          mission.reward - Math.floor((attempts - 1) * 2)
        );

        db.update(schema.userProgress)
          .set({
            completed: true,
            attempts,
            score,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.userProgress.id, progress.id))
          .run();

        // Update leaderboard
        const leaderboardEntry = db
          .select()
          .from(schema.leaderboard)
          .where(eq(schema.leaderboard.userId, uid))
          .get();

        if (leaderboardEntry) {
          db.update(schema.leaderboard)
            .set({
              totalScore: leaderboardEntry.totalScore + score,
              missionsCompleted: leaderboardEntry.missionsCompleted + 1,
            })
            .where(eq(schema.leaderboard.userId, uid))
            .run();
        }

        return {
          correct: true,
          message: "Mission complete!",
          score,
          attempts,
        };
      }

      db.update(schema.userProgress)
        .set({ attempts })
        .where(eq(schema.userProgress.id, progress.id))
        .run();

      return {
        correct: false,
        message: "Incorrect. Try again.",
        attempts,
        hint: attempts >= 3 ? mission.hint : undefined,
      };
    },
    {
      params: t.Object({ id: t.Number() }),
      body: t.Object({ answer: t.String() }),
    }
  )
  .use(requireAdmin)
  .post(
    "/",
    ({ body }) => {
      const mission = db
        .insert(schema.missions)
        .values(body)
        .returning()
        .get();
      return mission;
    },
    {
      body: t.Object({
        title: t.String(),
        description: t.Optional(t.String()),
        dollId: t.Number(),
        encryptedMessage: t.String(),
        solution: t.String(),
        hint: t.Optional(t.String()),
        reward: t.Optional(t.Number()),
        difficulty: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
      }),
    }
  );
