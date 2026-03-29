import { t } from 'elysia';
import type { TObject, TProperties } from '@sinclair/typebox';

/**
 * Body schema that allows additional properties.
 * Handlers MUST pick only known fields before passing to Prisma.
 */
export function Body<T extends TProperties>(props: T): TObject<T> {
  return t.Object(props, { additionalProperties: true }) as any;
}

/** Pick only the keys defined in the schema from a body object */
export function pickFields<T extends Record<string, any>>(body: T, keys: string[]): Partial<T> {
  const result: any = {};
  for (const key of keys) {
    if (key in body && body[key] !== undefined) {
      result[key] = body[key];
    }
  }
  return result;
}
