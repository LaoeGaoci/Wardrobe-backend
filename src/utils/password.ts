const PBKDF2_ITERATIONS = 600_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);

  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0),
  );
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits: number,
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    bits,
  );

  return new Uint8Array(derivedBits);
}

export async function hashPassword(
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(
    new Uint8Array(SALT_BYTES),
  );

  const hash = await derivePassword(
    password,
    salt,
    PBKDF2_ITERATIONS,
    HASH_BITS,
  );

  return [
    'pbkdf2',
    'sha256',
    PBKDF2_ITERATIONS.toString(),
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const parts = storedHash.split('$');

    if (parts.length !== 5) {
      return false;
    }

    const [
      algorithm,
      hashAlgorithm,
      iterationsText,
      saltText,
      expectedHashText,
    ] = parts;

    if (
      algorithm !== 'pbkdf2' ||
      hashAlgorithm !== 'sha256'
    ) {
      return false;
    }

    const iterations = Number(iterationsText);

    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }

    const salt = base64ToBytes(saltText);
    const expectedHash = base64ToBytes(expectedHashText);

    const actualHash = await derivePassword(
      password,
      salt,
      iterations,
      expectedHash.length * 8,
    );

    return timingSafeEqual(
      actualHash,
      expectedHash,
    );
  } catch {
    return false;
  }
}

function timingSafeEqual(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}