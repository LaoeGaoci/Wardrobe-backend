import {
  hashPassword,
  verifyPassword,
} from '../utils/password';
import { generateId } from '../utils/id';
import type {
  PublicUser,
  PublicUserRow,
  UserRow,
} from '../types/user';
import { UserRepository } from '../repositories/user_repository';

const DEV_VERIFICATION_CODE = '123456';
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const SEARCH_KEYWORD_MAX_LENGTH = 100;

export class UserService {
  private readonly repository: UserRepository;

  constructor(
    db: D1Database,
  ) {
    this.repository = new UserRepository(db);
  }

  async requestVerificationCode(
    input: unknown,
  ): Promise<void> {
    const body = requireObject(input);

    const email = normalizeEmail(
      requireString(
        body.email,
        'Email is required',
      ),
    );

    validateEmail(email);

    // Development only.
    // Replace this with a real email verification flow
    // before production.
  }

  async register(
    input: unknown,
  ): Promise<PublicUser> {
    const body = requireObject(input);

    const email = normalizeEmail(
      requireString(
        body.email,
        'Email is required',
      ),
    );

    const verificationCode = requireString(
      body.verificationCode,
      'Verification code is required',
    ).trim();

    const password = requireString(
      body.password,
      'Password is required',
    );

    validateEmail(email);
    validatePassword(password);

    if (
      verificationCode !==
      DEV_VERIFICATION_CODE
    ) {
      throw new UserServiceError(
        'Invalid verification code',
        400,
      );
    }

    if (
      await this.repository.findByEmail(email)
    ) {
      throw new UserServiceError(
        'Email already exists',
        409,
      );
    }

    const id = generateId();

    const username =
      await this.createInitialUsername(
        email,
        id,
      );

    const passwordHash =
      await hashPassword(password);

    try {
      await this.repository.createUser({
        id,
        username,
        email,
        passwordHash,
        avatarUrl: null,
      });
    } catch (error) {
      if (
        this.isUniqueConstraintError(error)
      ) {
        throw new UserServiceError(
          'Email or username already exists',
          409,
        );
      }

      throw error;
    }

    const created =
      await this.repository.findPublicById(id);

    if (!created) {
      throw new UserServiceError(
        'Failed to create user',
        500,
      );
    }

    return this.toPublicUser(created);
  }

  async login(
    input: unknown,
  ): Promise<PublicUser> {
    const body = requireObject(input);

    const email = normalizeEmail(
      requireString(
        body.email,
        'Email is required',
      ),
    );

    const password = requireString(
      body.password,
      'Password is required',
    );

    validateEmail(email);

    const user =
      await this.repository.findByEmail(
        email,
      );

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

    return this.toPublicUser(user);
  }

  async getUserById(
    id: string,
  ): Promise<PublicUser | null> {
    const user =
      await this.repository.findPublicById(
        id,
      );

    return user
      ? this.toPublicUser(user)
      : null;
  }

  async updateUsername(
    userId: string,
    input: unknown,
  ): Promise<PublicUser> {
    const body = requireObject(input);

    const username = requireString(
      body.username,
      'Username is required',
    ).trim();

    validateUsername(username);

    const current =
      await this.repository.findPublicById(
        userId,
      );

    if (!current) {
      throw new UserServiceError(
        'User not found',
        404,
      );
    }

    const sameUsername =
      await this.repository.findByUsername(
        username,
      );

    if (
      sameUsername &&
      sameUsername.id !== userId
    ) {
      throw new UserServiceError(
        'Username already exists',
        409,
      );
    }

    try {
      const updated =
        await this.repository.updateUsername(
          userId,
          username,
        );

      if (!updated) {
        throw new UserServiceError(
          'Failed to update user',
          500,
        );
      }

      return this.toPublicUser(updated);
    } catch (error) {
      if (
        this.isUniqueConstraintError(error)
      ) {
        throw new UserServiceError(
          'Username already exists',
          409,
        );
      }

      throw error;
    }
  }

  async searchUsers(
    keyword: string,
    currentUserId: string,
  ): Promise<PublicUser[]> {
    const normalized = keyword.trim();

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
      await this.repository.searchUsers(
        normalized,
        currentUserId,
      );

    return users.map(
      (user) =>
        this.toPublicUser(user),
    );
  }

  /**
   * 删除账户。
   *
   * 返回用户删除前拥有的衣物图片 R2 key，
   * 由 Route 在数据库删除成功后继续清理 R2。
   */
  async deleteUser(
    userId: string,
  ): Promise<string[]> {
    if (
      !(await this.repository.existsById(
        userId,
      ))
    ) {
      throw new UserServiceError(
        'User not found',
        404,
      );
    }

    /**
     * 必须先查询。
     *
     * users 删除后，
     * clothing 会因为 ON DELETE CASCADE
     * 自动消失。
     */
    const imageKeys =
      await this.repository
        .findOwnedClothingImageKeys(
          userId,
        );

    /**
     * 删除用户。
     *
     * 数据库会级联清理：
     *
     * clothing
     * friend_requests
     * friendships
     * recommendations
     * recommendation_items
     */
    await this.repository.deleteById(
      userId,
    );

    return imageKeys;
  }

  private async createInitialUsername(
    email: string,
    userId: string,
  ): Promise<string> {
    const localPart =
      email.split('@')[0].trim();

    const base =
      localPart.slice(
        0,
        USERNAME_MAX_LENGTH,
      ) || 'user';

    if (
      !(await this.repository.findByUsername(
        base,
      ))
    ) {
      return base;
    }

    const suffix =
      `_${userId.slice(0, 6)}`;

    const prefixLength =
      USERNAME_MAX_LENGTH -
      suffix.length;

    return `${base.slice(
      0,
      prefixLength,
    )}${suffix}`;
  }

  private toPublicUser(
    user: PublicUserRow | UserRow,
  ): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl:
        user.avatar_url ?? '',
    };
  }

  private isUniqueConstraintError(
    error: unknown,
  ): boolean {
    return (
      error instanceof Error &&
      error.message
        .toLowerCase()
        .includes('unique')
    );
  }
}

export class UserServiceError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);

    this.name =
      'UserServiceError';
  }
}

function requireObject(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
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
    typeof value !== 'string' ||
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
      .test(email);

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