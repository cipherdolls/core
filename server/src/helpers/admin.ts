import type { JwtPayload } from '../auth/jwt';

export function requireAdmin(user: JwtPayload, set: any) {
  if (user.role !== 'ADMIN') {
    set.status = 403;
    throw new Error('Admin access required');
  }
}
