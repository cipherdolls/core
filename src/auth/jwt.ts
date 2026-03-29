import jwt from 'jsonwebtoken';
import Elysia from 'elysia';
import { prisma } from '../db';

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

/** Elysia plugin: resolves the authenticated user from JWT or API key. Sets 401 if missing/invalid. */
export const jwtGuard = new Elysia({ name: 'jwtGuard' }).derive(
  { as: 'scoped' },
  async ({ headers, set }) => {
    const token = extractBearer(headers.authorization);
    if (!token) {
      set.status = 401;
      throw new Error('Missing authorization token');
    }

    // Try JWT first
    try {
      const payload = verifyToken(token);
      return { user: payload };
    } catch {
      // Not a valid JWT — fall through to API key check
    }

    // Try API key
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: token },
      include: { user: true },
    });

    if (!apiKey) {
      set.status = 401;
      throw new Error('Invalid authorization token');
    }

    return {
      user: {
        signerAddress: apiKey.user.signerAddress,
        userId: apiKey.user.id,
        role: apiKey.user.role,
      } as JwtPayload,
    };
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
