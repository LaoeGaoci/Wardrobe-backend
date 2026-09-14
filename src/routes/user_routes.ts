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
 *
 * 删除：
 *
 * 1. 用户
 * 2. 用户衣物
 * 3. 好友申请
 * 4. 好友关系
 * 5. 推荐记录
 * 6. 推荐衣物关联
 * 7. 用户衣物对应的 R2 图片
 */
userRoutes.delete(
  '/me',
  async (c) => {
    const service =
      getUserService(
        c.env.DB,
      );

    const userId =
      c.get('userId');

    /**
     * UserService 会：
     *
     * 1. 在删除数据库数据前取得 R2 keys
     * 2. 删除 users row
     * 3. 触发数据库 ON DELETE CASCADE
     */
    const imageKeys =
      await service.deleteUser(
        userId,
      );

    /**
     * D1 已经成功删除账户。
     *
     * 之后尝试删除所有衣物图片。
     *
     * R2 删除失败不能再向客户端返回
     * “注销失败”，否则会出现：
     *
     * 数据库账号已经不存在，
     * 但 App 却认为注销失败。
     *
     * 因此这里只记录失败对象，
     * 不回滚已经完成的账户删除。
     */
    if (imageKeys.length > 0) {
      const results =
        await Promise.allSettled(
          imageKeys.map(
            (key) =>
              c.env.IMAGES.delete(
                key,
              ),
          ),
        );

      results.forEach(
        (
          result,
          index,
        ) => {
          if (
            result.status ===
            'rejected'
          ) {
            console.error(
              'Failed to delete clothing image during account deletion:',
              imageKeys[index],
              result.reason,
            );
          }
        },
      );
    }

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