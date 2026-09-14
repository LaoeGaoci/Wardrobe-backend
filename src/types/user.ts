export interface UserRow {
  id: string;
  username: string;
  email: string;

  password_hash: string;

  /**
   * JWT 版本。
   *
   * 修改密码 / 重置密码后递增。
   * 旧 JWT 中的 version 与这里不一致时，
   * authMiddleware 会拒绝该 Token。
   */
  token_version: number;

  avatar_url: string | null;

  created_at: string;
  updated_at: string;
}

export interface PublicUserRow {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string;
}

/**
 * Service 内部认证结果。
 *
 * tokenVersion 不返回给 Flutter，
 * 只用于服务器生成 JWT。
 */
export interface UserAuthenticationResult {
  user: PublicUser;
  tokenVersion: number;
}

export interface RegisterInput {
  email: string;
  verificationCode: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateUserInput {
  username: string;
}

export interface CreateUserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
}