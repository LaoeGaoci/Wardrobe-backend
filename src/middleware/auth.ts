import {
  createMiddleware,
} from 'hono/factory';

import type {
  AppEnv,
} from '../types/env';

import {
  UserRepository,
} from '../repositories/user_repository';

import {
  verifyAccessToken,
} from '../utils/token';

import {
  errorResponse,
} from '../utils/response';

export const authMiddleware =
  createMiddleware<AppEnv>(
    async (c, next) => {
      const authorization =
        c.req.header(
          'Authorization',
        );

      if (
        !authorization?.startsWith(
          'Bearer ',
        )
      ) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      const token =
        authorization
          .slice(7)
          .trim();

      if (!token) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      const userId =
        await verifyAccessToken(
          token,
          c.env.AUTH_SECRET,
        );

      if (!userId) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      const repository =
        new UserRepository(
          c.env.DB,
        );

      if (
        !(await repository.existsById(
          userId,
        ))
      ) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      c.set(
        'userId',
        userId,
      );

      await next();
    },
  );