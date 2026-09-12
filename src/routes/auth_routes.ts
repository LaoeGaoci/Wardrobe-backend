import { Hono } from 'hono';

import type {
  AppEnv,
} from '../types/env';

import {
  UserService,
  UserServiceError,
} from '../services/user_service';

import {
  createAccessToken,
} from '../utils/token';

import {
  successResponse,
} from '../utils/response';

const authRoutes =
  new Hono<AppEnv>();

function getUserService(
  db: D1Database,
): UserService {
  return new UserService(db);
}

/**
 * POST /api/auth/code
 *
 * Development stage:
 * validates the email only.
 *
 * Current verification code:
 * 123456
 */
authRoutes.post(
  '/code',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const service =
      getUserService(
        c.env.DB,
      );

    await service
      .requestVerificationCode(
        body,
      );

    return successResponse({
      success: true,
    });
  },
);

/**
 * POST /api/auth/register
 */
authRoutes.post(
  '/register',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const service =
      getUserService(
        c.env.DB,
      );

    const user =
      await service.register(
        body,
      );

    const token =
      await createAccessToken(
        user.id,
        c.env.AUTH_SECRET,
      );

    return successResponse(
      {
        user,
        token,
      },
      201,
    );
  },
);

/**
 * POST /api/auth/login
 */
authRoutes.post(
  '/login',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const service =
      getUserService(
        c.env.DB,
      );

    const user =
      await service.login(
        body,
      );

    const token =
      await createAccessToken(
        user.id,
        c.env.AUTH_SECRET,
      );

    return successResponse({
      user,
      token,
    });
  },
);

async function readJsonBody(
  request: Request,
): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new UserServiceError(
      'Invalid JSON body',
      400,
    );
  }
}

export default authRoutes;