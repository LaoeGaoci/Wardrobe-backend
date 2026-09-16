import {
  hashPassword,
  verifyPassword,
} from '../../utils/password';

import {
  generateId,
} from '../../utils/id';

import type {
  PublicUser,
  PublicUserRow,
  UserRow,
} from '../../types/user/user';

import {
  UserRepository,
} from '../../repositories/user/user_repository';

import {
  VerificationCodeService,
  VerificationCodeServiceError,
} from './verification_code_service';


// ============================================================
// Constants
// ============================================================

const USERNAME_MAX_LENGTH =
  20;

const PASSWORD_MIN_LENGTH =
  8;

const PASSWORD_MAX_LENGTH =
  128;

const SEARCH_KEYWORD_MAX_LENGTH =
  100;


// ============================================================
// Internal types
// ============================================================

/**
 * 登录 / 注册完成后的内部结果。
 *
 * tokenVersion 只给 Route 用来签发 JWT，
 * 不返回给 Flutter。
 */
interface AuthenticationResult {
  user: PublicUser;
  tokenVersion: number;
}


// ============================================================
// User Service
// ============================================================

export class UserService {
  private readonly repository:
    UserRepository;

  constructor(
    db: D1Database,
  ) {
    this.repository =
      new UserRepository(
        db,
      );
  }


  // ============================================================
  // Register verification code
  // ============================================================

  /**
   * 请求注册验证码。
   *
   * POST /api/auth/code
   *
   * Body:
   *
   * {
   *   "email": "user@example.com"
   * }
   */
  async requestVerificationCode(
    input: unknown,
    verificationService:
      VerificationCodeService,
  ): Promise<void> {
    const body =
      requireObject(
        input,
      );

    const email =
      normalizeEmail(
        requireString(
          body.email,
          'Email is required',
        ),
      );

    validateEmail(
      email,
    );

    /**
     * 已注册邮箱没有继续发送
     * 注册验证码的必要。
     */
    if (
      await this.repository
        .findByEmail(
          email,
        )
    ) {
      throw new UserServiceError(
        'Email already exists',
        409,
      );
    }

    try {
      await verificationService
        .requestCode(
          email,
          'register',
        );
    } catch (error) {
      this.rethrowVerificationError(
        error,
      );
    }
  }


  // ============================================================
  // Register
  // ============================================================

  /**
   * 用户注册。
   *
   * POST /api/auth/register
   */
  async register(
    input: unknown,
    verificationService:
      VerificationCodeService,
  ): Promise<AuthenticationResult> {
    const body =
      requireObject(
        input,
      );

    const email =
      normalizeEmail(
        requireString(
          body.email,
          'Email is required',
        ),
      );

    const verificationCode =
      requireString(
        body.verificationCode,
        'Verification code is required',
      ).trim();

    const password =
      requireString(
        body.password,
        'Password is required',
      );

    validateEmail(
      email,
    );

    validatePassword(
      password,
    );

    /**
     * 在消费验证码之前检查邮箱。
     *
     * 否则用户如果邮箱已经注册，
     * 验证码会白白被消费掉。
     */
    if (
      await this.repository
        .findByEmail(
          email,
        )
    ) {
      throw new UserServiceError(
        'Email already exists',
        409,
      );
    }

    /**
     * 验证注册验证码。
     *
     * purpose = register
     *
     * 验证成功后验证码立即消费。
     */
    try {
      await verificationService
        .verifyAndConsume(
          email,
          'register',
          verificationCode,
        );
    } catch (error) {
      this.rethrowVerificationError(
        error,
      );
    }

    const id =
      generateId();

    const username =
      await this
        .createInitialUsername(
          email,
          id,
        );

    const passwordHash =
      await hashPassword(
        password,
      );

    try {
      await this.repository
        .createUser({
          id,
          username,
          email,
          passwordHash,
          avatarUrl: null,
        });
    } catch (error) {
      if (
        this
          .isUniqueConstraintError(
            error,
          )
      ) {
        throw new UserServiceError(
          'Email or username already exists',
          409,
        );
      }

      throw error;
    }

    /**
     * 这里必须读取完整 UserRow，
     * 因为签发 JWT 需要 token_version。
     */
    const created =
      await this.repository
        .findById(
          id,
        );

    if (!created) {
      throw new UserServiceError(
        'Failed to create user',
        500,
      );
    }

    return {
      user:
        this.toPublicUser(
          created,
        ),

      tokenVersion:
        created.token_version,
    };
  }


  // ============================================================
  // Login
  // ============================================================

  /**
   * 用户登录。
   *
   * POST /api/auth/login
   */
  async login(
    input: unknown,
  ): Promise<AuthenticationResult> {
    const body =
      requireObject(
        input,
      );

    const email =
      normalizeEmail(
        requireString(
          body.email,
          'Email is required',
        ),
      );

    const password =
      requireString(
        body.password,
        'Password is required',
      );

    validateEmail(
      email,
    );

    const user =
      await this.repository
        .findByEmail(
          email,
        );

    /**
     * 无论邮箱不存在还是密码错误，
     * 都返回同一个错误。
     *
     * 避免账户枚举。
     */
    if (!user) {
      throw new UserServiceError(
        'Invalid email or password',
        401,
      );
    }

    const valid =
      await verifyPassword(
        password,
        user.password_hash,
      );

    if (!valid) {
      throw new UserServiceError(
        'Invalid email or password',
        401,
      );
    }

    return {
      user:
        this.toPublicUser(
          user,
        ),

      tokenVersion:
        user.token_version,
    };
  }


  // ============================================================
  // Current user
  // ============================================================

  /**
   * 根据用户 ID 获取公开用户信息。
   */
  async getUserById(
    id: string,
  ): Promise<
    PublicUser | null
  > {
    const user =
      await this.repository
        .findPublicById(
          id,
        );

    return user
      ? this.toPublicUser(
          user,
        )
      : null;
  }


  // ============================================================
  // Update username
  // ============================================================

  async updateUsername(
    userId: string,
    input: unknown,
  ): Promise<PublicUser> {
    const body =
      requireObject(
        input,
      );

    const username =
      requireString(
        body.username,
        'Username is required',
      ).trim();

    validateUsername(
      username,
    );

    const current =
      await this.repository
        .findPublicById(
          userId,
        );

    if (!current) {
      throw new UserServiceError(
        'User not found',
        404,
      );
    }

    const sameUsername =
      await this.repository
        .findByUsername(
          username,
        );

    /**
     * 找到了用户名，
     * 并且不是当前用户自己。
     */
    if (
      sameUsername &&
      sameUsername.id !==
        userId
    ) {
      throw new UserServiceError(
        'Username already exists',
        409,
      );
    }

    try {
      const updated =
        await this.repository
          .updateUsername(
            userId,
            username,
          );

      if (!updated) {
        throw new UserServiceError(
          'Failed to update user',
          500,
        );
      }

      return this.toPublicUser(
        updated,
      );
    } catch (error) {
      if (
        this
          .isUniqueConstraintError(
            error,
          )
      ) {
        throw new UserServiceError(
          'Username already exists',
          409,
        );
      }

      throw error;
    }
  }


  // ============================================================
  // Change password
  // ============================================================

  /**
   * 已登录用户修改密码。
   *
   * PATCH /api/users/me/password
   *
   * Body:
   *
   * {
   *   "currentPassword": "...",
   *   "newPassword": "..."
   * }
   *
   * 成功以后：
   *
   * password_hash 更新
   * token_version + 1
   *
   * 所有旧 JWT 失效。
   *
   * Route 会给当前设备重新签发 JWT。
   */
  async changePassword(
    userId: string,
    input: unknown,
  ): Promise<number> {
    const body =
      requireObject(
        input,
      );

    const currentPassword =
      requireString(
        body.currentPassword,
        'Current password is required',
      );

    const newPassword =
      requireString(
        body.newPassword,
        'New password is required',
      );

    validatePassword(
      newPassword,
    );

    const user =
      await this.repository
        .findById(
          userId,
        );

    if (!user) {
      throw new UserServiceError(
        'User not found',
        404,
      );
    }

    /**
     * 验证当前密码。
     */
    const currentPasswordValid =
      await verifyPassword(
        currentPassword,
        user.password_hash,
      );

    if (
      !currentPasswordValid
    ) {
      throw new UserServiceError(
        'Current password is incorrect',
        400,
      );
    }

    /**
     * 新密码不能和当前密码相同。
     *
     * 必须通过 verifyPassword 比较，
     * 不能直接比较 Hash。
     */
    const samePassword =
      await verifyPassword(
        newPassword,
        user.password_hash,
      );

    if (samePassword) {
      throw new UserServiceError(
        'New password must be different from current password',
        400,
      );
    }

    const newPasswordHash =
      await hashPassword(
        newPassword,
      );

    const updated =
      await this.repository
        .updatePasswordAndRotateToken(
          userId,
          newPasswordHash,
        );

    if (!updated) {
      throw new UserServiceError(
        'Failed to update password',
        500,
      );
    }

    /**
     * 返回新 token_version。
     *
     * Route 使用它给当前设备
     * 签发新的 JWT。
     */
    return updated.token_version;
  }


  // ============================================================
  // Password reset verification code
  // ============================================================

  /**
   * 请求忘记密码验证码。
   *
   * POST /api/auth/password-reset/code
   *
   * Body:
   *
   * {
   *   "email": "user@example.com"
   * }
   *
   * 注意：
   *
   * 无论邮箱是否存在，
   * 对客户端都应该表现为成功。
   *
   * 防止账户枚举。
   */
  async requestPasswordResetCode(
    input: unknown,
    verificationService:
      VerificationCodeService,
  ): Promise<void> {
    const body =
      requireObject(
        input,
      );

    const email =
      normalizeEmail(
        requireString(
          body.email,
          'Email is required',
        ),
      );

    validateEmail(
      email,
    );

    const user =
      await this.repository
        .findByEmail(
          email,
        );

    /**
     * 邮箱不存在：
     *
     * 不发送邮件，
     * 但也不告诉客户端。
     */
    if (!user) {
      return;
    }

    try {
      await verificationService
        .requestCode(
          email,
          'password_reset',
          {
            /**
             * 60 秒内重复请求，
             * 仍然表现为成功。
             *
             * 避免通过 429 判断
             * 邮箱是否注册。
             */
            silentCooldown:
              true,
          },
        );
    } catch (error) {
      /**
       * 忘记密码接口不能通过
       * “邮件发送是否成功”
       * 暴露邮箱是否存在。
       *
       * 所以这里只记录错误。
       *
       * Route 仍然返回 success。
       */
      console.error(
        'Failed to send password reset verification email:',
        error,
      );
    }
  }


  // ============================================================
  // Reset password
  // ============================================================

  /**
   * 忘记密码后重置密码。
   *
   * POST /api/auth/password-reset
   *
   * Body:
   *
   * {
   *   "email": "...",
   *   "verificationCode": "123456",
   *   "newPassword": "..."
   * }
   *
   * 成功以后：
   *
   * - 修改 password_hash
   * - token_version + 1
   * - 所有旧 JWT 失效
   * - 不自动登录
   */
  async resetPassword(
    input: unknown,
    verificationService:
      VerificationCodeService,
  ): Promise<void> {
    const body =
      requireObject(
        input,
      );

    const email =
      normalizeEmail(
        requireString(
          body.email,
          'Email is required',
        ),
      );

    const verificationCode =
      requireString(
        body.verificationCode,
        'Verification code is required',
      ).trim();

    const newPassword =
      requireString(
        body.newPassword,
        'New password is required',
      );

    validateEmail(
      email,
    );

    validatePassword(
      newPassword,
    );

    /**
     * 先验证并消费 password_reset 验证码。
     *
     * 注册验证码无法用于这里。
     */
    try {
      await verificationService
        .verifyAndConsume(
          email,
          'password_reset',
          verificationCode,
        );
    } catch (error) {
      this.rethrowVerificationError(
        error,
      );
    }

    const user =
      await this.repository
        .findByEmail(
          email,
        );

    /**
     * 正常情况下不会发生：
     *
     * 没有用户就不会发送 reset code。
     *
     * 仍然不要返回 User not found，
     * 避免账户信息泄露。
     */
    if (!user) {
      throw new UserServiceError(
        'Invalid or expired verification code',
        400,
      );
    }

    /**
     * 新密码不能和原密码相同。
     *
     * 注意：
     *
     * 这个检查必须放在验证码验证成功之后。
     *
     * 否则可能通过返回结果猜测某邮箱
     * 当前是否使用某个密码。
     */
    const samePassword =
      await verifyPassword(
        newPassword,
        user.password_hash,
      );

    if (samePassword) {
      throw new UserServiceError(
        'New password must be different from current password',
        400,
      );
    }

    const newPasswordHash =
      await hashPassword(
        newPassword,
      );

    const updated =
      await this.repository
        .updatePasswordAndRotateToken(
          user.id,
          newPasswordHash,
        );

    if (!updated) {
      throw new UserServiceError(
        'Failed to reset password',
        500,
      );
    }

    /**
     * 不返回 JWT。
     *
     * 用户重置完成后，
     * 必须使用新密码重新登录。
     */
  }


  // ============================================================
  // Search users
  // ============================================================

  async searchUsers(
    keyword: string,
    currentUserId: string,
  ): Promise<PublicUser[]> {
    const normalized =
      keyword.trim();

    if (!normalized) {
      return [];
    }

    if (
      normalized.length >
      SEARCH_KEYWORD_MAX_LENGTH
    ) {
      throw new UserServiceError(
        'Search keyword is too long',
        400,
      );
    }

    const users =
      await this.repository
        .searchUsers(
          normalized,
          currentUserId,
        );

    return users.map(
      (user) =>
        this.toPublicUser(
          user,
        ),
    );
  }


  // ============================================================
  // Delete account
  // ============================================================

  /**
   * 删除账户。
   *
   * 返回用户删除前拥有的衣物图片 R2 key，
   * Route 在数据库删除成功后继续清理 R2。
   */
  async deleteUser(
    userId: string,
  ): Promise<string[]> {
    if (
      !(
        await this.repository
          .existsById(
            userId,
          )
      )
    ) {
      throw new UserServiceError(
        'User not found',
        404,
      );
    }

    /**
     * 必须先取得 R2 keys。
     *
     * users 删除以后，
     * clothing 会通过
     * ON DELETE CASCADE 删除。
     */
    const imageKeys =
      await this.repository
        .findOwnedClothingImageKeys(
          userId,
        );

    /**
     * 删除 user。
     *
     * 数据库自动级联清理：
     *
     * clothing
     * friend_requests
     * friendships
     * recommendations
     * recommendation_items
     */
    await this.repository
      .deleteById(
        userId,
      );

    return imageKeys;
  }


  // ============================================================
  // Internal helpers
  // ============================================================

  /**
   * 根据邮箱 local part
   * 自动生成初始用户名。
   */
  private async createInitialUsername(
    email: string,
    userId: string,
  ): Promise<string> {
    const localPart =
      email
        .split('@')[0]
        .trim();

    const base =
      localPart.slice(
        0,
        USERNAME_MAX_LENGTH,
      ) || 'user';

    if (
      !(
        await this.repository
          .findByUsername(
            base,
          )
      )
    ) {
      return base;
    }

    const suffix =
      `_${userId.slice(
        0,
        6,
      )}`;

    const prefixLength =
      USERNAME_MAX_LENGTH -
      suffix.length;

    return `${
      base.slice(
        0,
        prefixLength,
      )
    }${suffix}`;
  }


  /**
   * 数据库 UserRow →
   * 前端可见 PublicUser。
   *
   * password_hash
   * token_version
   *
   * 永远不会暴露。
   */
  private toPublicUser(
    user:
      | PublicUserRow
      | UserRow,
  ): PublicUser {
    return {
      id:
        user.id,

      username:
        user.username,

      email:
        user.email,

      avatarUrl:
        user.avatar_url ?? '',
    };
  }


  /**
   * 将 VerificationCodeServiceError
   * 转换成 UserServiceError。
   *
   * 这样 index.ts 不需要额外添加
   * VerificationCodeServiceError handler。
   */
  private rethrowVerificationError(
    error: unknown,
  ): never {
    if (
      error instanceof
      VerificationCodeServiceError
    ) {
      throw new UserServiceError(
        error.message,
        error.status,
      );
    }

    throw error;
  }


  private isUniqueConstraintError(
    error: unknown,
  ): boolean {
    return (
      error instanceof Error &&
      error.message
        .toLowerCase()
        .includes(
          'unique',
        )
    );
  }
}


// ============================================================
// User service error
// ============================================================

export class UserServiceError
  extends Error {
  constructor(
    message: string,
    public readonly status:
      number,
  ) {
    super(
      message,
    );

    this.name =
      'UserServiceError';
  }
}


// ============================================================
// Validation helpers
// ============================================================

function requireObject(
  value: unknown,
): Record<
  string,
  unknown
> {
  if (
    typeof value !==
      'object' ||
    value === null ||
    Array.isArray(
      value,
    )
  ) {
    throw new UserServiceError(
      'Invalid request body',
      400,
    );
  }

  return value as Record<
    string,
    unknown
  >;
}


function requireString(
  value: unknown,
  message: string,
): string {
  if (
    typeof value !==
      'string' ||
    !value
  ) {
    throw new UserServiceError(
      message,
      400,
    );
  }

  return value;
}


function normalizeEmail(
  email: string,
): string {
  return email
    .trim()
    .toLowerCase();
}


function validateEmail(
  email: string,
): void {
  const valid =
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(
        email,
      );

  if (!valid) {
    throw new UserServiceError(
      'Invalid email address',
      400,
    );
  }
}


function validateUsername(
  username: string,
): void {
  if (!username) {
    throw new UserServiceError(
      'Username cannot be empty',
      400,
    );
  }

  if (
    username.length >
    USERNAME_MAX_LENGTH
  ) {
    throw new UserServiceError(
      `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
      400,
    );
  }
}


function validatePassword(
  password: string,
): void {
  if (
    password.length <
    PASSWORD_MIN_LENGTH
  ) {
    throw new UserServiceError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      400,
    );
  }

  if (
    password.length >
    PASSWORD_MAX_LENGTH
  ) {
    throw new UserServiceError(
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      400,
    );
  }
}