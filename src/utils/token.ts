const TOKEN_TTL_SECONDS =
  60 * 60 * 24 * 30;

const encoder =
  new TextEncoder();

const decoder =
  new TextDecoder();

interface AccessTokenPayload {
  /**
   * User ID
   */
  sub: string;

  /**
   * User token_version
   */
  ver: number;

  /**
   * Issued at
   */
  iat: number;

  /**
   * Expires at
   */
  exp: number;
}

export interface VerifiedAccessToken {
  userId: string;
  tokenVersion: number;
}

function bytesToBase64Url(
  bytes: Uint8Array,
): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(
      byte,
    );
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(
  value: string,
): Uint8Array {
  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(
      Math.ceil(
        value.length / 4,
      ) * 4,
      '=',
    );

  const binary =
    atob(base64);

  return Uint8Array.from(
    binary,
    (char) =>
      char.charCodeAt(0),
  );
}

async function importHmacKey(
  secret: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    [
      'sign',
      'verify',
    ],
  );
}

/**
 * 创建 JWT-like Access Token。
 *
 * tokenVersion 必须与数据库 users.token_version
 * 保持一致。
 */
export async function createAccessToken(
  userId: string,
  tokenVersion: number,
  secret: string,
): Promise<string> {
  const now =
    Math.floor(
      Date.now() / 1000,
    );

  const payload:
    AccessTokenPayload = {
      sub: userId,
      ver: tokenVersion,
      iat: now,
      exp:
        now +
        TOKEN_TTL_SECONDS,
    };

  const payloadText =
    bytesToBase64Url(
      encoder.encode(
        JSON.stringify(
          payload,
        ),
      ),
    );

  const key =
    await importHmacKey(
      secret,
    );

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(
        payloadText,
      ),
    );

  return `${
    payloadText
  }.${
    bytesToBase64Url(
      new Uint8Array(
        signature,
      ),
    )
  }`;
}

/**
 * 验证 Access Token 本身。
 *
 * 注意：
 *
 * 这里只验证：
 *
 * - 格式
 * - HMAC 签名
 * - userId
 * - tokenVersion
 * - exp
 *
 * tokenVersion 是否仍然等于数据库中的值，
 * 由 authMiddleware 检查。
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<
  VerifiedAccessToken | null
> {
  try {
    const [
      payloadText,
      signatureText,
      extra,
    ] = token.split('.');

    if (
      !payloadText ||
      !signatureText ||
      extra
    ) {
      return null;
    }

    const key =
      await importHmacKey(
        secret,
      );

    const validSignature =
      await crypto.subtle.verify(
        'HMAC',
        key,
        base64UrlToBytes(
          signatureText,
        ),
        encoder.encode(
          payloadText,
        ),
      );

    if (!validSignature) {
      return null;
    }

    const payload =
      JSON.parse(
        decoder.decode(
          base64UrlToBytes(
            payloadText,
          ),
        ),
      ) as Partial<
        AccessTokenPayload
      >;

    if (
      typeof payload.sub !==
        'string' ||
      !payload.sub ||
      typeof payload.ver !==
        'number' ||
      !Number.isInteger(
        payload.ver,
      ) ||
      payload.ver < 0 ||
      typeof payload.exp !==
        'number' ||
      payload.exp <=
        Math.floor(
          Date.now() / 1000,
        )
    ) {
      return null;
    }

    return {
      userId:
        payload.sub,
      tokenVersion:
        payload.ver,
    };
  } catch {
    return null;
  }
}