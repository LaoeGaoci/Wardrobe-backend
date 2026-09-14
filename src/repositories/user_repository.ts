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
      .first<{ value: number }>();

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
            instr(lower(username), lower(?)) > 0
            OR instr(lower(email), lower(?)) > 0
          )
        ORDER BY username COLLATE NOCASE ASC
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
      .bind(username, id)
      .run();

    return this.findPublicById(id);
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