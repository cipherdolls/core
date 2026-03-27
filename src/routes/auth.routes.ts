import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET ?? "cipher-dolls-secret-key-change-me",
      exp: "7d",
    })
  )
  .post(
    "/register",
    async ({ body, set }) => {
      const { username, email, password } = body;

      const existing = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .get();

      if (existing) {
        set.status = 409;
        return { error: "Email already registered" };
      }

      const passwordHash = await Bun.password.hash(password);

      const user = db
        .insert(schema.users)
        .values({ username, email, passwordHash })
        .returning()
        .get();

      // Initialize leaderboard entry
      db.insert(schema.leaderboard)
        .values({ userId: user.id })
        .run();

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const { email, password } = body;

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .get();

      if (!user) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const valid = await Bun.password.verify(password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const token = await jwt.sign({
        sub: String(user.id),
        role: user.role,
      });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    }
  );
