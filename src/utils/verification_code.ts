import type {
  VerificationPurpose,
} from '../types/user/verification_code';

const encoder =
  new TextEncoder();

/**
 * 生成 [0, max) 范围内的安全随机整数。
 *
 * 使用 rejection sampling，
 * 避免直接 % max 带来的 modulo bias。
 */
function secureRandomInt(
  max: number,
): number {
  if (
    !Number.isInteger(max) ||
    max <= 0
  ) {
    throw new Error(
      'Invalid random integer range',
    );
  }

  const maxUint32 =
    0x1_0000_0000;

  const limit =
    maxUint32 -
    (
      maxUint32 %
      max
    );

  const buffer =
    new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(
      buffer,
    );

    const value =
      buffer[0];

    if (value < limit) {
      return value % max;
    }
  }
}

/**
 * 生成 6 位数字验证码。
 *
 * 000000 ~ 999999
 */
export function generateVerificationCode():
string {
  return secureRandomInt(
    1_000_000,
  )
    .toString()
    .padStart(
      6,
      '0',
    );
}

function bytesToBase64Url(
  bytes: Uint8Array,
): string {
  let binary = '';

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(
        byte,
      );
  }

  return btoa(binary)
    .replaceAll(
      '+',
      '-',
    )
    .replaceAll(
      '/',
      '_',
    )
    .replace(
      /=+$/g,
      '',
    );
}

/**
 * 使用：
 *
 * email + purpose + code
 *
 * 一起进行 HMAC。
 *
 * 因此：
 *
 * 同一个验证码不能跨邮箱使用，
 * 也不能跨 register/password_reset 使用。
 */
export async function hashVerificationCode(
  email: string,
  purpose:
    VerificationPurpose,
  code: string,
  secret: string,
): Promise<string> {
  const key =
    await crypto.subtle
      .importKey(
        'raw',
        encoder.encode(
          secret,
        ),
        {
          name: 'HMAC',
          hash: 'SHA-256',
        },
        false,
        [
          'sign',
        ],
      );

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  const payload =
    [
      normalizedEmail,
      purpose,
      code,
    ].join('\n');

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(
        payload,
      ),
    );

  return bytesToBase64Url(
    new Uint8Array(
      signature,
    ),
  );
}

/**
 * Constant-time string compare.
 *
 * code_hash 长度固定，
 * 避免普通字符串比较造成不必要的 timing leak。
 */
export function constantTimeEqual(
  a: string,
  b: string,
): boolean {
  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < a.length;
    index++
  ) {
    difference |=
      a.charCodeAt(
        index,
      ) ^
      b.charCodeAt(
        index,
      );
  }

  return difference === 0;
}