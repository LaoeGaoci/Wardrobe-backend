import {
	PushDeviceRepository,
} from '../../repositories/notification/push_device_repository';

import {
	generateId,
} from '../../utils/id';

import type {
	PushLocale,
	PushPlatform,
} from '../../types/notification/push';

const TOKEN_MAX_LENGTH =
	4096;

export class PushDeviceService {
	private readonly repository:
		PushDeviceRepository;

	constructor(
		db: D1Database,
	) {
		this.repository =
			new PushDeviceRepository(
				db,
			);
	}

	// ============================================================
	// Register
	// ============================================================

	async register(
		currentUserId: string,
		input: unknown,
	): Promise<void> {
		const body =
			requireObject(input);

		const token =
			requireText(
				body.token,
				'FCM token is required',
			);

		if (
			token.length >
			TOKEN_MAX_LENGTH
		) {
			throw new PushDeviceServiceError(
				'FCM token is too long',
				400,
			);
		}

		const platform =
			parsePlatform(
				body.platform,
			);

		const locale =
			parseLocale(
				body.locale,
			);

		await this.repository.upsert({
			id:
				generateId(),
			userId:
				currentUserId,
			platform,
			token,
			locale,
		});
	}

	// ============================================================
	// Unregister
	// ============================================================

	async unregister(
		currentUserId: string,
		input: unknown,
	): Promise<void> {
		const body =
			requireObject(input);

		const token =
			requireText(
				body.token,
				'FCM token is required',
			);

		await this.repository
			.deleteForUser(
				currentUserId,
				token,
			);
	}
}

function parsePlatform(
	value: unknown,
): PushPlatform {
	if (value !== 'android') {
		throw new PushDeviceServiceError(
			'Unsupported push platform',
			400,
		);
	}

	return value;
}

function parseLocale(
	value: unknown,
): PushLocale {
	switch (value) {
		case 'en':
		case 'zh_Hans':
		case 'zh_Hant':
			return value;

		default:
			throw new PushDeviceServiceError(
				'Unsupported locale',
				400,
			);
	}
}

function requireObject(
	value: unknown,
): Record<string, unknown> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value)
	) {
		throw new PushDeviceServiceError(
			'Invalid request body',
			400,
		);
	}

	return value as Record<
		string,
		unknown
	>;
}

function requireText(
	value: unknown,
	message: string,
): string {
	if (typeof value !== 'string') {
		throw new PushDeviceServiceError(
			message,
			400,
		);
	}

	const result =
		value.trim();

	if (!result) {
		throw new PushDeviceServiceError(
			message,
			400,
		);
	}

	return result;
}

export class PushDeviceServiceError
	extends Error {
	constructor(
		message: string,
		public readonly status:
			number,
	) {
		super(message);
		this.name =
			'PushDeviceServiceError';
	}
}
