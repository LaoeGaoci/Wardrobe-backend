import {
  Hono,
} from 'hono';

import type {
  AppEnv,
} from '../../types/env';

import {
  UserService,
  UserServiceError,
} from '../../services/user/user_service';

import {
  EmailService,
} from '../../services/user/email_service';

import {
  VerificationCodeService,
} from '../../services/user/verification_code_service';

import {
  createAccessToken,
} from '../../utils/token';

import {
  successResponse,
} from '../../utils/response';


// ============================================================
// Router
// ============================================================

const authRoutes =
  new Hono<AppEnv>();


// ============================================================
// Service factories
// ============================================================

function getUserService(
  db: D1Database,
): UserService {
  return new UserService(
    db,
  );
}


/**
 * 创建当前请求需要的验证码 Service。
 *
 * VerificationCodeService 负责：
 *
 * - 生成验证码
 * - HMAC Hash
 * - 存入 D1
 * - 有效期
 * - 重发冷却
 * - 错误次数
 * - 一次性消费
 *
 * EmailService 负责真正发邮件。
 */
function getVerificationService(
  db: D1Database,
  emailBinding:
    AppEnv['Bindings']['EMAIL'],
  emailFrom: string,
  verificationSecret: string,
): VerificationCodeService {
  const emailService =
    new EmailService(
      emailBinding,
      emailFrom,
    );

  return new VerificationCodeService(
    db,
    emailService,
    verificationSecret,
  );
}


// ============================================================
// Register verification code
// ============================================================

/**
 * POST /api/auth/code
 *
 * 请求注册验证码。
 *
 * Body:
 *
 * {
 *   "email": "user@example.com"
 * }
 *
 * 成功：
 *
 * {
 *   "success": true
 * }
 */
authRoutes.post(
  '/code',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const userService =
      getUserService(
        c.env.DB,
      );

    const verificationService =
      getVerificationService(
        c.env.DB,
        c.env.EMAIL,
        c.env.EMAIL_FROM,
        c.env.VERIFICATION_SECRET,
      );

    await userService
      .requestVerificationCode(
        body,
        verificationService,
      );

    return successResponse({
      success: true,
    });
  },
);


// ============================================================
// Register
// ============================================================

/**
 * POST /api/auth/register
 *
 * Body:
 *
 * {
 *   "email": "user@example.com",
 *   "verificationCode": "123456",
 *   "password": "12345678"
 * }
 *
 * 验证码必须：
 *
 * purpose = register
 *
 * 注册成功以后立即登录，
 * 返回 user + JWT。
 */
authRoutes.post(
  '/register',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const userService =
      getUserService(
        c.env.DB,
      );

    const verificationService =
      getVerificationService(
        c.env.DB,
        c.env.EMAIL,
        c.env.EMAIL_FROM,
        c.env.VERIFICATION_SECRET,
      );

    const result =
      await userService
        .register(
          body,
          verificationService,
        );

    /**
     * JWT 中写入：
     *
     * userId
     * tokenVersion
     */
    const token =
      await createAccessToken(
        result.user.id,
        result.tokenVersion,
        c.env.AUTH_SECRET,
      );

    /**
     * tokenVersion 是后端内部状态，
     * 不返回客户端。
     */
    return successResponse(
      {
        user:
          result.user,

        token,
      },
      201,
    );
  },
);


// ============================================================
// Login
// ============================================================

/**
 * POST /api/auth/login
 *
 * Body:
 *
 * {
 *   "email": "user@example.com",
 *   "password": "12345678"
 * }
 */
authRoutes.post(
  '/login',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const userService =
      getUserService(
        c.env.DB,
      );

    const result =
      await userService
        .login(
          body,
        );

    const token =
      await createAccessToken(
        result.user.id,
        result.tokenVersion,
        c.env.AUTH_SECRET,
      );

    return successResponse({
      user:
        result.user,

      token,
    });
  },
);


// ============================================================
// Password reset verification code
// ============================================================

/**
 * POST /api/auth/password-reset/code
 *
 * 请求忘记密码验证码。
 *
 * Body:
 *
 * {
 *   "email": "user@example.com"
 * }
 *
 * 注意：
 *
 * 无论：
 *
 * - 邮箱不存在
 * - 邮箱存在
 *
 * 客户端都得到：
 *
 * {
 *   "success": true
 * }
 *
 * 防止账户枚举。
 */
authRoutes.post(
  '/password-reset/code',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const userService =
      getUserService(
        c.env.DB,
      );

    const verificationService =
      getVerificationService(
        c.env.DB,
        c.env.EMAIL,
        c.env.EMAIL_FROM,
        c.env.VERIFICATION_SECRET,
      );

    await userService
      .requestPasswordResetCode(
        body,
        verificationService,
      );

    return successResponse({
      success: true,
    });
  },
);


// ============================================================
// Password reset
// ============================================================

/**
 * POST /api/auth/password-reset
 *
 * Body:
 *
 * {
 *   "email": "user@example.com",
 *   "verificationCode": "123456",
 *   "newPassword": "87654321"
 * }
 *
 * 验证码必须：
 *
 * purpose = password_reset
 *
 * 成功以后：
 *
 * - password_hash 更新
 * - token_version + 1
 * - 所有旧 JWT 失效
 * - 不自动登录
 */
authRoutes.post(
  '/password-reset',
  async (c) => {
    const body =
      await readJsonBody(
        c.req.raw,
      );

    const userService =
      getUserService(
        c.env.DB,
      );

    const verificationService =
      getVerificationService(
        c.env.DB,
        c.env.EMAIL,
        c.env.EMAIL_FROM,
        c.env.VERIFICATION_SECRET,
      );

    await userService
      .resetPassword(
        body,
        verificationService,
      );

    return successResponse({
      success: true,
    });
  },
);


// ============================================================
// JSON body
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


// ============================================================
// Export
// ============================================================

export default authRoutes;