import type {
  CreateUserRecord,
  PublicUserRow,
  UserRow,
} from '../types/user';

export class UserRepository {
  constructor(
    private readonly db: D1Database,
  ) {}

  async findById(
    id: string,
  ): Promise<UserRow | null> {
    const row = await this.db
      .prepare(
        `
        SELECT
          id,
          username,
          email,
          password_hash,
          token_version,
          avatar_url,
          created_at,
          updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
      )
      .bind(id)
      .first<UserRow>();

    return row ?? null;
  }

  async findPublicById(
    id: string,
  ): Promise<PublicUserRow | null> {
    const row = await this.db
      .prepare(
        `
        SELECT
          id,
          username,
          email,
          avatar_url
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
      )
      .bind(id)
      .first<PublicUserRow>();

    return row ?? null;
  }

  async findByEmail(
    email: string,
  ): Promise<UserRow | null> {
    const row = await this.db
      .prepare(
        `
        SELECT
          id,
          username,
          email,
          password_hash,
          token_version,
          avatar_url,
          created_at,
          updated_at
        FROM users
        WHERE email = ? COLLATE NOCASE
        LIMIT 1
        `,
      )
      .bind(email)
      .first<UserRow>();

    return row ?? null;
  }

  async findByUsername(
    username: string,
  ): Promise<UserRow | null> {
    const row = await this.db
      .prepare(
        `
        SELECT
          id,
          username,
          email,
          password_hash,
          token_version,
          avatar_url,
          created_at,
          updated_at
        FROM users
        WHERE username = ? COLLATE NOCASE
        LIMIT 1
        `,
      )
      .bind(username)
      .first<UserRow>();

    return row ?? null;
  }

  async existsById(
    id: string,
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `
        SELECT 1 AS value
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
      )
      .bind(id)
      .first<{
        value: number;
      }>();

    return row !== null;
  }

  async searchUsers(
    keyword: string,
    excludeUserId: string,
    limit = 20,
  ): Promise<PublicUserRow[]> {
    const safeLimit = Math.min(
      Math.max(limit, 1),
      50,
    );

    const result = await this.db
      .prepare(
        `
        SELECT
          id,
          username,
          email,
          avatar_url
        FROM users
        WHERE id != ?
          AND (
            instr(
              lower(username),
              lower(?)
            ) > 0
            OR
            instr(
              lower(email),
              lower(?)
            ) > 0
          )
        ORDER BY
          username COLLATE NOCASE ASC
        LIMIT ?
        `,
      )
      .bind(
        excludeUserId,
        keyword,
        keyword,
        safeLimit,
      )
      .all<PublicUserRow>();

    return result.results;
  }

  async createUser(
    user: CreateUserRecord,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO users (
          id,
          username,
          email,
          password_hash,
          avatar_url
        )
        VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(
        user.id,
        user.username,
        user.email,
        user.passwordHash,
        user.avatarUrl,
      )
      .run();

    /**
     * token_version 不需要显式写入。
     *
     * 数据库默认：
     *
     * token_version = 0
     */
  }

  async updateUsername(
    id: string,
    username: string,
  ): Promise<PublicUserRow | null> {
    await this.db
      .prepare(
        `
        UPDATE users
        SET
          username = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      )
      .bind(
        username,
        id,
      )
      .run();

    return this.findPublicById(id);
  }

  /**
   * 修改密码，同时废弃所有旧 JWT。
   *
   * token_version + 1
   *
   * 修改后返回最新 UserRow，
   * 让当前设备可以生成新的 JWT。
   */
  async updatePasswordAndRotateToken(
    id: string,
    passwordHash: string,
  ): Promise<UserRow | null> {
    await this.db
      .prepare(
        `
        UPDATE users
        SET
          password_hash = ?,
          token_version = token_version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      )
      .bind(
        passwordHash,
        id,
      )
      .run();

    return this.findById(id);
  }

  async deleteById(
    id: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        DELETE FROM users
        WHERE id = ?
        `,
      )
      .bind(id)
      .run();
  }

  /**
   * 查询当前用户所有衣物对应的 R2 object key。
   *
   * 注销账户时必须在删除 users row 之前调用，
   * 因为 users 删除以后 clothing 会通过
   * ON DELETE CASCADE 一并删除。
   */
  async findOwnedClothingImageKeys(
    userId: string,
  ): Promise<string[]> {
    const result = await this.db
      .prepare(
        `
        SELECT image_url
        FROM clothing
        WHERE owner_id = ?
          AND image_url IS NOT NULL
          AND image_url != ''
        `,
      )
      .bind(userId)
      .all<{
        image_url: string;
      }>();

    return (
      result.results ?? []
    )
      .map(
        (row) =>
          row.image_url,
      )
      .filter(
        (key) =>
          key.length > 0,
      );
  }
}