import type {
  CreateVerificationCodeRecord,
  VerificationCodeRow,
  VerificationPurpose,
} from '../types/verification_code';

export class VerificationCodeRepository {
  constructor(
    private readonly db:
      D1Database,
  ) {}

  /**
   * 查询某邮箱、某用途最近的一条验证码。
   */
  async findLatest(
    email: string,
    purpose:
      VerificationPurpose,
  ): Promise<
    VerificationCodeRow | null
  > {
    const row =
      await this.db
        .prepare(
          `
          SELECT
            id,
            email,
            purpose,
            code_hash,
            expires_at,
            attempts,
            consumed_at,
            created_at
          FROM verification_codes
          WHERE email = ? COLLATE NOCASE
            AND purpose = ?
          ORDER BY created_at DESC
          LIMIT 1
          `,
        )
        .bind(
          email,
          purpose,
        )
        .first<
          VerificationCodeRow
        >();

    return row ?? null;
  }

  /**
   * 查询最近一条尚未消费的验证码。
   */
  async findLatestActive(
    email: string,
    purpose:
      VerificationPurpose,
  ): Promise<
    VerificationCodeRow | null
  > {
    const row =
      await this.db
        .prepare(
          `
          SELECT
            id,
            email,
            purpose,
            code_hash,
            expires_at,
            attempts,
            consumed_at,
            created_at
          FROM verification_codes
          WHERE email = ? COLLATE NOCASE
            AND purpose = ?
            AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
          `,
        )
        .bind(
          email,
          purpose,
        )
        .first<
          VerificationCodeRow
        >();

    return row ?? null;
  }

  async create(
    record:
      CreateVerificationCodeRecord,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO verification_codes (
          id,
          email,
          purpose,
          code_hash,
          expires_at,
          attempts,
          consumed_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
        `,
      )
      .bind(
        record.id,
        record.email,
        record.purpose,
        record.codeHash,
        record.expiresAt,
        record.createdAt,
      )
      .run();
  }

  /**
   * 让旧验证码全部失效。
   */
  async invalidateActive(
    email: string,
    purpose:
      VerificationPurpose,
    timestamp: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        UPDATE verification_codes
        SET consumed_at = ?
        WHERE email = ? COLLATE NOCASE
          AND purpose = ?
          AND consumed_at IS NULL
        `,
      )
      .bind(
        timestamp,
        email,
        purpose,
      )
      .run();
  }

  async incrementAttempts(
    id: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        UPDATE verification_codes
        SET attempts =
            attempts + 1
        WHERE id = ?
          AND consumed_at IS NULL
        `,
      )
      .bind(id)
      .run();
  }

  /**
   * 原子消费验证码。
   *
   * 如果已经被另一个请求消费，
   * changes 会是 0。
   */
  async consumeIfActive(
    id: string,
    timestamp: number,
  ): Promise<boolean> {
    const result =
      await this.db
        .prepare(
          `
          UPDATE verification_codes
          SET consumed_at = ?
          WHERE id = ?
            AND consumed_at IS NULL
          `,
        )
        .bind(
          timestamp,
          id,
        )
        .run();

    return (
      result.meta
        .changes ?? 0
    ) > 0;
  }

  /**
   * 邮件发送失败时删除刚生成的验证码。
   */
  async deleteById(
    id: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        DELETE FROM verification_codes
        WHERE id = ?
        `,
      )
      .bind(id)
      .run();
  }

  /**
   * 清理历史验证码。
   *
   * 可以在请求验证码时顺便执行。
   */
  async deleteOlderThan(
    timestamp: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `
        DELETE FROM verification_codes
        WHERE expires_at < ?
        `,
      )
      .bind(
        timestamp,
      )
      .run();
  }
}