import {
  createMiddleware,
} from 'hono/factory';

import type {
  AppEnv,
} from '../types/env';

import {
  UserRepository,
} from '../repositories/user/user_repository';

import {
  verifyAccessToken,
} from '../utils/token';

import {
  errorResponse,
} from '../utils/response';

export const authMiddleware =
  createMiddleware<AppEnv>(
    async (
      c,
      next,
    ) => {
      const authorization =
        c.req.header(
          'Authorization',
        );

      if (
        !authorization
          ?.startsWith(
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

      /**
       * 验证 Token 本身：
       *
       * - 签名
       * - 有效期
       * - userId
       * - tokenVersion
       */
      const verifiedToken =
        await verifyAccessToken(
          token,
          c.env.AUTH_SECRET,
        );

      if (!verifiedToken) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      const repository =
        new UserRepository(
          c.env.DB,
        );

      /**
       * 必须读取完整用户，
       * 因为需要检查 token_version。
       */
      const user =
        await repository.findById(
          verifiedToken.userId,
        );

      if (!user) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      /**
       * Token 版本不一致：
       *
       * 说明用户已经修改 / 重置密码，
       * 当前 JWT 属于旧会话。
       */
      if (
        user.token_version !==
        verifiedToken.tokenVersion
      ) {
        return errorResponse(
          'Unauthorized',
          401,
        );
      }

      c.set(
        'userId',
        user.id,
      );

      await next();
    },
  );