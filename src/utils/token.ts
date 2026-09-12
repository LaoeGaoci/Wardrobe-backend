const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(
      Math.ceil(value.length / 4) * 4,
      '=',
    );

  const binary = atob(base64);

  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0),
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
    ['sign', 'verify'],
  );
}

export async function createAccessToken(
  userId: string,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const payload: AccessTokenPayload = {
    sub: userId,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const payloadText = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  );

  const key = await importHmacKey(secret);

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadText),
  );

  return `${payloadText}.${bytesToBase64Url(
    new Uint8Array(signature),
  )}`;
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<string | null> {
  try {
    const [payloadText, signatureText, extra] =
      token.split('.');

    if (!payloadText || !signatureText || extra) {
      return null;
    }

    const key = await importHmacKey(secret);

    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signatureText),
      encoder.encode(payloadText),
    );

    if (!validSignature) {
      return null;
    }

    const payload = JSON.parse(
      decoder.decode(
        base64UrlToBytes(payloadText),
      ),
    ) as Partial<AccessTokenPayload>;

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}