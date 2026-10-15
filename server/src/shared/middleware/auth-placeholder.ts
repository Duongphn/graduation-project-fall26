import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { findDevAuthUser } from '../../infrastructure/database/dev-auth-users.js';
import type { ActorReference } from '../contracts/actor.js';
import type { UserRole } from '../domain/statuses.js';
import { AppError, forbidden, unauthorized } from '../errors/app-error.js';

// Callers authenticate with the access token issued by /auth/login (header
// `Authorization: Bearer <token>`, signed with JWT_ACCESS_SECRET; claims { userId, email, role },
// `sub` is accepted too). The token only names the user: the role and the account status are read
// from the users collection on every request, so a demoted or locked account loses access at once.
// A missing, invalid or expired token answers 401; other tokens signed with the same secret (the
// Google sign-up and password reset tokens carry a `type` claim) are refused.
//
// Without a token, the caller may act through the header `x-dev-user-id` ONLY when
// ALLOW_DEV_AUTH=true and NODE_ENV is development or test (env.allowDevAuth). The id must be an
// existing user; the role and the account status come from the users collection (the old
// x-dev-role header is ignored), and a locked account is refused. Otherwise every guarded
// route answers 401.
export interface RequestAuth {
  userId: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: RequestAuth;
  }
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

const accountLocked = () => new AppError(403, 'ACCOUNT_LOCKED', 'Tài khoản của bạn đang bị khoá.');

/** The account named by a user id: refused when missing or locked. */
const resolveUser = async (userId: string): Promise<RequestAuth | undefined> => {
  const user = await findDevAuthUser(userId);
  if (!user) return undefined;
  if (user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > new Date())) {
    throw accountLocked();
  }
  return { userId, role: user.role };
};

/** The development caller from x-dev-user-id, checked against the users collection. */
const resolveDevAuth = async (request: Request): Promise<RequestAuth | undefined> => {
  if (!env.allowDevAuth) return undefined;
  const userId = request.header('x-dev-user-id');
  if (!userId || !OBJECT_ID.test(userId)) return undefined;
  return resolveUser(userId);
};

const invalidToken = () =>
  new AppError(401, 'INVALID_ACCESS_TOKEN', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

/** The caller from `Authorization: Bearer`, null without that header. */
const resolveBearerAuth = async (request: Request): Promise<RequestAuth | null> => {
  const header = request.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw invalidToken();

  let claims: unknown;
  try {
    claims = jwt.verify(token, env.jwtAccessSecret, { algorithms: ['HS256'] });
  } catch {
    throw invalidToken();
  }
  if (typeof claims !== 'object' || claims === null || 'type' in claims) throw invalidToken();
  const { userId, sub } = claims as { userId?: unknown; sub?: unknown };
  const id = typeof userId === 'string' ? userId : typeof sub === 'string' ? sub : undefined;
  if (!id || !OBJECT_ID.test(id)) throw invalidToken();

  const auth = await resolveUser(id);
  if (!auth) throw invalidToken();
  return auth;
};

/** Sets `request.auth` from the access token, else from the development header. */
const authenticate = async (request: Request): Promise<RequestAuth | undefined> => {
  if (!request.auth) {
    const auth = (await resolveBearerAuth(request)) ?? (await resolveDevAuth(request));
    if (auth) request.auth = auth;
  }
  return request.auth;
};

/** The signed-in caller, or undefined. Valid after requireUser/requireAdmin/optionalAuth. */
export const getRequestAuth = (request: Request): RequestAuth | undefined => request.auth;

const requireRole =
  (role?: UserRole): RequestHandler =>
  (request: Request, _response: Response, next: NextFunction) => {
    authenticate(request)
      .then((auth) => {
        if (!auth) return next(unauthorized());
        if (role && auth.role !== role) return next(forbidden());
        return next();
      })
      .catch(next);
  };

export const requireUser = requireRole();
export const requireAdmin = requireRole('ADMIN');

/**
 * For public routes that show more to a signed-in caller: sets `request.auth` when the caller is
 * known and never answers 401 (an invalid token or a locked caller is treated as anonymous).
 */
export const optionalAuth: RequestHandler = (request, _response, next) => {
  authenticate(request)
    .then(() => next())
    .catch(() => next());
};

/** The actor recorded in status history and audit logs. Call after requireUser/requireAdmin. */
export const getRequestActor = (request: Request): ActorReference & { actorId: string } => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  return { actorType: auth.role === 'ADMIN' ? 'ADMIN' : 'USER', actorId: auth.userId };
};

export const getRequestUserId = (request: Request): string => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  return auth.userId;
};
