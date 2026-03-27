import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";

export const dollsRoutes = new Elysia({ prefix: "/dolls" })
  .get("/", () => {
    return db.select().from(schema.dolls).all();
  })
  .get(
    "/:id",
    ({ params }) => {
      const doll = db
        .select()
        .from(schema.dolls)
        .where(eq(schema.dolls.id, params.id))
        .get();

      if (!doll) return { error: "Doll not found" };
      return doll;
    },
    { params: t.Object({ id: t.Number() }) }
  )
  .get(
    "/:id/missions",
    ({ params }) => {
      return db
        .select()
        .from(schema.missions)
        .where(eq(schema.missions.dollId, params.id))
        .all();
    },
    { params: t.Object({ id: t.Number() }) }
  )
  .use(requireAdmin)
  .post(
    "/",
    ({ body, userId }) => {
      const doll = db
        .insert(schema.dolls)
        .values({ ...body, createdBy: Number(userId) })
        .returning()
        .get();
      return doll;
    },
    {
      body: t.Object({
        name: t.String(),
        codename: t.String(),
        description: t.Optional(t.String()),
        cipherType: t.String(),
        difficulty: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
        status: t.Optional(
          t.Union([
            t.Literal("active"),
            t.Literal("inactive"),
            t.Literal("retired"),
          ])
        ),
        imageUrl: t.Optional(t.String()),
      }),
    }
  )
  .put(
    "/:id",
    ({ params, body }) => {
      const doll = db
        .update(schema.dolls)
        .set({ ...body, updatedAt: new Date().toISOString() })
        .where(eq(schema.dolls.id, params.id))
        .returning()
        .get();

      if (!doll) return { error: "Doll not found" };
      return doll;
    },
    {
      params: t.Object({ id: t.Number() }),
      body: t.Object({
        name: t.Optional(t.String()),
        codename: t.Optional(t.String()),
        description: t.Optional(t.String()),
        cipherType: t.Optional(t.String()),
        difficulty: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
        status: t.Optional(
          t.Union([
            t.Literal("active"),
            t.Literal("inactive"),
            t.Literal("retired"),
          ])
        ),
        imageUrl: t.Optional(t.String()),
      }),
    }
  )
  .delete(
    "/:id",
    ({ params }) => {
      db.delete(schema.dolls).where(eq(schema.dolls.id, params.id)).run();
      return { success: true };
    },
    { params: t.Object({ id: t.Number() }) }
  );
