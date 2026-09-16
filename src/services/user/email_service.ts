import type {
  EmailSendBinding,
} from '../../types/env';

import type {
  VerificationPurpose,
} from '../../types/user/verification_code';

const EMAIL_SEND_TIMEOUT_MS =
  15_000;

export class EmailService {
  constructor(
    private readonly email:
      EmailSendBinding,

    private readonly from:
      string,
  ) {}

  async sendVerificationCode(
    to: string,
    code: string,
    purpose:
      VerificationPurpose,
  ): Promise<void> {
    const isRegister =
      purpose === 'register';

    const title =
      isRegister
        ? '注册验证'
        : '重置密码';

    const englishTitle =
      isRegister
        ? 'Registration'
        : 'Password Reset';

    const subject =
      `[Wardrobe] ${title}验证码`;

    const text =
      [
        `Wardrobe ${title}`,
        '',
        `你的验证码是：${code}`,
        '',
        '验证码将在 10 分钟后失效。',
        '如果这不是你本人的操作，请忽略此邮件。',
        '',
        `Wardrobe ${englishTitle}`,
        '',
        `Your verification code is: ${code}`,
        '',
        'This code expires in 10 minutes.',
        'If you did not request this, you can ignore this email.',
      ].join('\n');

    const html =
      `
<!doctype html>
<html>
  <body style="
    margin:0;
    padding:0;
    background:#f6f6f6;
    font-family:Arial,Helvetica,sans-serif;
    color:#202124;
  ">
    <div style="
      max-width:520px;
      margin:40px auto;
      background:#ffffff;
      border-radius:16px;
      padding:32px;
    ">
      <h2 style="
        margin-top:0;
        text-align:center;
      ">
        Wardrobe
      </h2>

      <p>
        你正在进行
        <strong>${title}</strong>。
      </p>

      <p>
        本次验证码：
      </p>

      <div style="
        margin:24px 0;
        padding:18px;
        text-align:center;
        font-size:32px;
        font-weight:700;
        letter-spacing:8px;
        background:#f2f3f5;
        border-radius:12px;
      ">
        ${code}
      </div>

      <p>
        验证码将在
        <strong>10 分钟</strong>
        后失效。
      </p>

      <p style="
        color:#777;
        font-size:14px;
      ">
        如果这不是你本人的操作，
        请忽略此邮件。
      </p>

      <hr style="
        border:none;
        border-top:1px solid #eeeeee;
        margin:28px 0;
      ">

      <p>
        Your verification code for
        <strong>${englishTitle}</strong>
        is:
      </p>

      <p style="
        font-size:20px;
        font-weight:bold;
      ">
        ${code}
      </p>

      <p style="
        color:#777;
        font-size:14px;
      ">
        This code expires in 10 minutes.
      </p>
    </div>
  </body>
</html>
      `.trim();

    console.log(
      '[EmailService] Sending verification email...',
      {
        to,
        from:
          this.from,
        purpose,
        subject,
      },
    );

    try {
      const sendPromise =
        this.email.send({
          to,

          from: {
            email:
              this.from,

            name:
              'Wardrobe',
          },

          subject,

          text,

          html,
        });

      const timeoutPromise =
        new Promise<never>(
          (_, reject) => {
            setTimeout(
              () => {
                reject(
                  new Error(
                    `Email sending timed out after ${EMAIL_SEND_TIMEOUT_MS}ms`,
                  ),
                );
              },
              EMAIL_SEND_TIMEOUT_MS,
            );
          },
        );

      const result =
        await Promise.race([
          sendPromise,
          timeoutPromise,
        ]);

      console.log(
        '[EmailService] Verification email sent successfully.',
        {
          to,
          purpose,
          result,
        },
      );
    } catch (error) {
      console.error(
        '[EmailService] Verification email send failed:',
        {
          to,
          from:
            this.from,
          purpose,
          error,
        },
      );

      throw new EmailServiceError(
        'Failed to send verification email',
      );
    }
  }
}

export class EmailServiceError
  extends Error {
  constructor(
    message: string,
  ) {
    super(message);

    this.name =
      'EmailServiceError';
  }
}