import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { bearer } from "@elysiajs/bearer";

export const authPlugin = new Elysia({ name: "auth" })
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET ?? "cipher-dolls-secret-key-change-me",
      exp: "7d",
    })
  )
  .use(bearer())
  .derive(async ({ jwt, bearer, set }) => {
    const payload = await jwt.verify(bearer);
    if (!payload) {
      set.status = 401;
      return { userId: null, userRole: null };
    }
    return {
      userId: payload.sub as string,
      userRole: payload.role as string,
    };
  });

export const requireAuth = new Elysia({ name: "requireAuth" })
  .use(authPlugin)
  .onBeforeHandle(({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  });

export const requireAdmin = new Elysia({ name: "requireAdmin" })
  .use(requireAuth)
  .onBeforeHandle(({ userRole, set }) => {
    if (userRole !== "admin") {
      set.status = 403;
      return { error: "Forbidden: admin access required" };
    }
  });
