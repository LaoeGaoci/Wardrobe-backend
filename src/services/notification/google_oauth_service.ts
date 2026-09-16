import type {
	Env,
} from '../../types/env';

const TOKEN_ENDPOINT =
	'https://oauth2.googleapis.com/token';

const FCM_SCOPE =
	'https://www.googleapis.com/auth/firebase.messaging';

const TOKEN_REFRESH_SAFETY_MS =
	5 * 60 * 1000;

let cachedAccessToken:
	| {
		value: string;
		expiresAt: number;
	}
	| null =
	null;

export class GoogleOAuthService {
	constructor(
		private readonly env: Env,
	) {}

	async getAccessToken(): Promise<string> {
		const cached =
			cachedAccessToken;

		if (
			cached &&
			Date.now() <
				cached.expiresAt -
				TOKEN_REFRESH_SAFETY_MS
		) {
			return cached.value;
		}

		const assertion =
			await this.createAssertion();

		const body =
			new URLSearchParams({
				grant_type:
					'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion,
			});

		const response =
			await fetch(
				TOKEN_ENDPOINT,
				{
					method: 'POST',
					headers: {
						'Content-Type':
							'application/x-www-form-urlencoded',
					},
					body:
						body.toString(),
				},
			);

		const text =
			await response.text();

		let data: unknown =
			null;

		try {
			data = text
				? JSON.parse(text)
				: null;
		} catch {
			data = null;
		}

		if (!response.ok) {
			throw new GoogleOAuthError(
				`Google OAuth token request failed (${response.status}): ${extractErrorMessage(data)}`,
			);
		}

		if (
			!data ||
			typeof data !== 'object'
		) {
			throw new GoogleOAuthError(
				'Google OAuth returned an invalid response',
			);
		}

		const record =
			data as Record<
				string,
				unknown
			>;

		const accessToken =
			typeof record.access_token ===
			'string'
				? record.access_token
				: '';

		const expiresIn =
			typeof record.expires_in ===
			'number'
				? record.expires_in
				: 3600;

		if (!accessToken) {
			throw new GoogleOAuthError(
				'Google OAuth response does not contain access_token',
			);
		}

		cachedAccessToken = {
			value:
				accessToken,
			expiresAt:
				Date.now() +
				expiresIn *
				1000,
		};

		return accessToken;
	}

	invalidateCachedToken(): void {
		cachedAccessToken = null;
	}

	private async createAssertion(): Promise<string> {
		const now =
			Math.floor(
				Date.now() /
				1000,
			);

		const header = {
			alg: 'RS256',
			typ: 'JWT',
		};

		const payload = {
			iss:
				this.env.FCM_CLIENT_EMAIL,
			scope:
				FCM_SCOPE,
			aud:
				TOKEN_ENDPOINT,
			iat:
				now,
			exp:
				now + 3600,
		};

		const unsigned =
			`${base64UrlJson(header)}.${base64UrlJson(payload)}`;

		const key =
			await importPrivateKey(
				this.env.FCM_PRIVATE_KEY,
			);

		const signature =
			await crypto.subtle.sign(
				{
					name:
						'RSASSA-PKCS1-v1_5',
				},
				key,
				new TextEncoder()
					.encode(unsigned),
			);

		return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
	}
}

async function importPrivateKey(
	rawPrivateKey: string,
): Promise<CryptoKey> {
	const normalized =
		rawPrivateKey
			.replace(/\\n/g, '\n')
			.trim();

	const base64 =
		normalized
			.replace(
				'-----BEGIN PRIVATE KEY-----',
				'',
			)
			.replace(
				'-----END PRIVATE KEY-----',
				'',
			)
			.replace(/\s+/g, '');

	if (!base64) {
		throw new GoogleOAuthError(
			'FCM_PRIVATE_KEY is empty',
		);
	}

	let binary: string;

	try {
		binary = atob(base64);
	} catch {
		throw new GoogleOAuthError(
			'FCM_PRIVATE_KEY is not a valid PKCS#8 private key',
		);
	}

	const bytes =
		new Uint8Array(
			binary.length,
		);

	for (
		let index = 0;
		index < binary.length;
		index++
	) {
		bytes[index] =
			binary.charCodeAt(index);
	}

	try {
		return await crypto.subtle.importKey(
			'pkcs8',
			bytes,
			{
				name:
					'RSASSA-PKCS1-v1_5',
				hash:
					'SHA-256',
			},
			false,
			[
				'sign',
			],
		);
	} catch {
		throw new GoogleOAuthError(
			'Failed to import FCM_PRIVATE_KEY',
		);
	}
}

function base64UrlJson(
	value: unknown,
): string {
	return base64UrlBytes(
		new TextEncoder()
			.encode(
				JSON.stringify(value),
			),
	);
}

function base64UrlBytes(
	bytes: Uint8Array,
): string {
	let binary = '';

	const chunkSize =
		0x8000;

	for (
		let offset = 0;
		offset < bytes.length;
		offset += chunkSize
	) {
		binary += String.fromCharCode(
			...bytes.subarray(
				offset,
				offset +
					chunkSize,
			),
		);
	}

	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

function extractErrorMessage(
	data: unknown,
): string {
	if (
		data &&
		typeof data === 'object'
	) {
		const record =
			data as Record<
				string,
				unknown
			>;

		if (
			typeof record.error_description ===
			'string'
		) {
			return record.error_description;
		}

		if (
			typeof record.error ===
			'string'
		) {
			return record.error;
		}
	}

	return 'unknown error';
}

export class GoogleOAuthError
	extends Error {
	constructor(
		message: string,
	) {
		super(message);
		this.name =
			'GoogleOAuthError';
	}
}
