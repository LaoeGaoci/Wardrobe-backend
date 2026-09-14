/**
 * Cloudflare Email Service binding。
 *
 * 这里只定义项目实际使用到的字段，
 * 不强依赖生成的 Workers 类型。
 */
export interface EmailSendBinding {
  send(
    message: {
      to:
        | string
        | {
            email: string;
            name?: string;
          };

      from:
        | string
        | {
            email: string;
            name?: string;
          };

      subject: string;

      html?: string;

      text?: string;
    },
  ): Promise<{
    messageId: string;
  }>;
}

export interface Env {
  DB: D1Database;

  IMAGES: R2Bucket;

  AUTH_SECRET: string;

  /**
   * 验证码 HMAC 密钥。
   *
   * 不应该与 AUTH_SECRET 共用。
   */
  VERIFICATION_SECRET:
    string;

  /**
   * Cloudflare Email Service.
   */
  EMAIL:
    EmailSendBinding;

  /**
   * 已在 Cloudflare Email Service
   * 验证的发件地址。
   */
  EMAIL_FROM:
    string;
}

export interface AppVariables {
  userId: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables:
    AppVariables;
};