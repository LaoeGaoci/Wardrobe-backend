import { Hono } from 'hono';

import type {
  AppEnv,
} from '../types/env';

import {
  authMiddleware,
} from '../middleware/auth';

import {
  UserService,
  UserServiceError,
} from '../services/user_service';

import {
  errorResponse,
  successResponse,
} from '../utils/response';

const userRoutes =
  new Hono<AppEnv>();

userRoutes.use(
  '*',
  authMiddleware,
);

function getUserService(
  db: D1Database,
): UserService {
  return new UserService(db);
}

/**
 * GET /api/users/me
 */
userRoutes.get(
  '/me',
  async (c) => {
    const service =
      getUserService(
        c.env.DB,
      );

    const user =
      await service.getUserById(
        c.get('userId'),
      );

    if (!user) {
      return errorResponse(
        'User not found',
        404,
      );
    }

    return successResponse({
      user,
    });
  },
);

/**
 * PATCH /api/users/me
 */
userRoutes.patch(
  '/me',
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
      await service
        .updateUsername(
          c.get('userId'),
          body,
        );

    return successResponse({
      user,
    });
  },
);

/**
 * DELETE /api/users/me
 */
userRoutes.delete(
  '/me',
  async (c) => {
    const service =
      getUserService(
        c.env.DB,
      );

    await service.deleteUser(
      c.get('userId'),
    );

    return successResponse({
      success: true,
    });
  },
);

/**
 * GET /api/users/search?q=keyword
 */
userRoutes.get(
  '/search',
  async (c) => {
    const service =
      getUserService(
        c.env.DB,
      );

    const users =
      await service.searchUsers(
        c.req.query('q') ?? '',
        c.get('userId'),
      );

    return successResponse({
      users,
    });
  },
);

/**
 * GET /api/users/:id
 */
userRoutes.get(
  '/:id',
  async (c) => {
    const service =
      getUserService(
        c.env.DB,
      );

    const user =
      await service.getUserById(
        c.req.param('id'),
      );

    if (!user) {
      return errorResponse(
        'User not found',
        404,
      );
    }

    return successResponse({
      user,
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

export default userRoutes;