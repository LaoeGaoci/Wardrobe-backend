import {
  generateId,
} from '../utils/id';

import {
  constantTimeEqual,
  generateVerificationCode,
  hashVerificationCode,
} from '../utils/verification_code';

import {
  VerificationCodeRepository,
} from '../repositories/verification_code_repository';

import {
  EmailService,
} from './email_service';

import type {
  VerificationPurpose,
} from '../types/verification_code';

const CODE_TTL_SECONDS =
  10 * 60;

const CODE_RESEND_INTERVAL_SECONDS =
  60;

const MAX_ATTEMPTS =
  5;

export class VerificationCodeService {
  private readonly repository:
    VerificationCodeRepository;

  constructor(
    db: D1Database,

    private readonly emailService:
      EmailService,

    private readonly secret:
      string,
  ) {
    this.repository =
      new VerificationCodeRepository(
        db,
      );
  }

  /**
   * 发送验证码。
   *
   * silentCooldown:
   *
   * true:
   *   60 秒内重复请求直接返回，
   *   不暴露状态。
   *
   * 用于 password_reset，
   * 防止账户枚举。
   *
   * false:
   *   注册时可以明确返回 429。
   */
  async requestCode(
    email: string,
    purpose:
      VerificationPurpose,
    options?: {
      silentCooldown?: boolean;
    },
  ): Promise<void> {
    const now =
      Math.floor(
        Date.now() /
        1000,
      );

    /**
     * 顺便清理一天以前过期的数据。
     */
    await this.repository
      .deleteOlderThan(
        now -
        24 * 60 * 60,
      );

    const latest =
      await this.repository
        .findLatest(
          email,
          purpose,
        );

    if (
      latest &&
      now -
        latest.created_at <
        CODE_RESEND_INTERVAL_SECONDS
    ) {
      if (
        options
          ?.silentCooldown
      ) {
        return;
      }

      throw new VerificationCodeServiceError(
        'Please wait before requesting another verification code',
        429,
      );
    }

    /**
     * 新验证码生成后，
     * 同用途旧验证码全部失效。
     */
    await this.repository
      .invalidateActive(
        email,
        purpose,
        now,
      );

    const code =
      generateVerificationCode();

    const codeHash =
      await hashVerificationCode(
        email,
        purpose,
        code,
        this.secret,
      );

    const id =
      generateId();

    await this.repository
      .create({
        id,

        email,

        purpose,

        codeHash,

        createdAt:
          now,

        expiresAt:
          now +
          CODE_TTL_SECONDS,
      });

    try {
      await this.emailService
        .sendVerificationCode(
          email,
          code,
          purpose,
        );
    } catch (error) {
      /**
       * 邮件发送失败时，
       * 不能留下一个用户永远收不到的有效验证码。
       */
      await this.repository
        .deleteById(
          id,
        );

      throw error;
    }
  }

  /**
   * 验证并消费验证码。
   *
   * 验证成功以后该验证码立即作废。
   */
  async verifyAndConsume(
    email: string,
    purpose:
      VerificationPurpose,
    code: string,
  ): Promise<void> {
    const normalizedCode =
      code.trim();

    if (
      !/^\d{6}$/.test(
        normalizedCode,
      )
    ) {
      throw new VerificationCodeServiceError(
        'Invalid verification code',
        400,
      );
    }

    const now =
      Math.floor(
        Date.now() /
        1000,
      );

    const record =
      await this.repository
        .findLatestActive(
          email,
          purpose,
        );

    if (!record) {
      throw new VerificationCodeServiceError(
        'Invalid or expired verification code',
        400,
      );
    }

    if (
      record.expires_at <=
      now
    ) {
      throw new VerificationCodeServiceError(
        'Invalid or expired verification code',
        400,
      );
    }

    if (
      record.attempts >=
      MAX_ATTEMPTS
    ) {
      throw new VerificationCodeServiceError(
        'Too many verification attempts',
        429,
      );
    }

    const actualHash =
      await hashVerificationCode(
        email,
        purpose,
        normalizedCode,
        this.secret,
      );

    const valid =
      constantTimeEqual(
        actualHash,
        record.code_hash,
      );

    if (!valid) {
      await this.repository
        .incrementAttempts(
          record.id,
        );

      if (
        record.attempts +
          1 >=
        MAX_ATTEMPTS
      ) {
        throw new VerificationCodeServiceError(
          'Too many verification attempts',
          429,
        );
      }

      throw new VerificationCodeServiceError(
        'Invalid verification code',
        400,
      );
    }

    /**
     * 原子消费。
     *
     * 两个并发请求不能同时使用一个验证码。
     */
    const consumed =
      await this.repository
        .consumeIfActive(
          record.id,
          now,
        );

    if (!consumed) {
      throw new VerificationCodeServiceError(
        'Invalid or expired verification code',
        400,
      );
    }
  }
}

export class VerificationCodeServiceError
  extends Error {
  constructor(
    message: string,
    public readonly status:
      number,
  ) {
    super(message);

    this.name =
      'VerificationCodeServiceError';
  }
}