import {
  Hono,
} from 'hono';

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
  createAccessToken,
} from '../utils/token';

import {
  errorResponse,
  successResponse,
} from '../utils/response';

const userRoutes =
  new Hono<AppEnv>();

/**
 * /api/users/*
 *
 * 全部要求登录。
 */
userRoutes.use(
  '*',
  authMiddleware,
);

function getUserService(
  db: D1Database,
): UserService {
  return new UserService(
    db,
  );
}

// ============================================================
// Current user
// ============================================================

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
      await service
        .getUserById(
          c.get(
            'userId',
          ),
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
 *
 * 修改用户名。
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
          c.get(
            'userId',
          ),
          body,
        );

    return successResponse({
      user,
    });
  },
);

// ============================================================
// Password
// ============================================================

/**
 * PATCH /api/users/me/password
 *
 * 修改当前用户密码。
 *
 * Body:
 *
 * {
 *   "currentPassword": "oldPassword",
 *   "newPassword": "newPassword"
 * }
 *
 * 修改成功：
 *
 * - 所有旧 JWT 失效
 * - 当前设备得到一个新 JWT
 */
userRoutes.patch(
  '/me/password',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const service =
      getUserService(
        c.env.DB,
      );

    const userId =
      c.get(
        'userId',
      );

    const tokenVersion =
      await service
        .changePassword(
          userId,
          body,
        );

    /**
     * 数据库 token_version 已经 +1。
     *
     * 给当前设备签发新 Token，
     * 保持当前设备登录状态。
     *
     * 其他设备持有的旧 Token
     * 会因为 version 不一致失效。
     */
    const token =
      await createAccessToken(
        userId,
        tokenVersion,
        c.env.AUTH_SECRET,
      );

    return successResponse({
      success: true,
      token,
    });
  },
);

// ============================================================
// Delete account
// ============================================================

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
      c.get(
        'userId',
      );

    /**
     * UserService 会：
     *
     * 1. 在删除数据库数据前取得 R2 keys
     * 2. 删除 users row
     * 3. 触发数据库 ON DELETE CASCADE
     */
    const imageKeys =
      await service
        .deleteUser(
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
     */
    if (
      imageKeys.length > 0
    ) {
      const results =
        await Promise
          .allSettled(
            imageKeys.map(
              (key) =>
                c.env.IMAGES
                  .delete(
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

// ============================================================
// Search
// ============================================================

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
      await service
        .searchUsers(
          c.req.query(
            'q',
          ) ?? '',
          c.get(
            'userId',
          ),
        );

    return successResponse({
      users,
    });
  },
);

// ============================================================
// User detail
// ============================================================

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
      await service
        .getUserById(
          c.req.param(
            'id',
          ),
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

// ============================================================
// JSON
// ============================================================

async function readJsonBody(
  request: Request,
): Promise<unknown> {
  try {
    return await request
      .json();
  } catch {
    throw new UserServiceError(
      'Invalid JSON body',
      400,
    );
  }
}

export default userRoutes;