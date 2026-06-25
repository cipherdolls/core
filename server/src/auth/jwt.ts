import jwt from 'jsonwebtoken';
import Elysia from 'elysia';

const JWT_SECRET = process.env.JWT_SECRET_KEY!;

export interface JwtPayload {
  signerAddress: string;
  userId: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function decodeToken(token: string): (JwtPayload & { exp: number }) | null {
  return jwt.decode(token) as (JwtPayload & { exp: number }) | null;
}

/** Extract bearer token from Authorization header */
function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/** Elysia plugin: resolves the authenticated user from JWT. Sets 401 if missing/invalid. */
export const jwtGuard = new Elysia({ name: 'jwtGuard' }).derive(
  { as: 'scoped' },
  async ({ headers, set }) => {
    const token = extractBearer(headers.authorization);
    if (!token) {
      set.status = 401;
      throw new Error('Missing authorization token');
    }

    try {
      const payload = verifyToken(token);
      return { user: payload };
    } catch {
      set.status = 401;
      throw new Error('Invalid authorization token');
    }
  },
);

/** Elysia plugin: optional JWT — sets user to null if no auth header */
export const optionalJwtGuard = new Elysia({ name: 'optionalJwtGuard' }).derive(
  { as: 'scoped' },
  async ({ headers }) => {
    const token = extractBearer(headers.authorization);
    if (!token) return { user: null as JwtPayload | null };

    try {
      const payload = verifyToken(token);
      return { user: payload as JwtPayload | null };
    } catch {
      return { user: null as JwtPayload | null };
    }
  },
);
