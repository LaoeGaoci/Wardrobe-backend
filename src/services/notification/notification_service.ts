import {
	NotificationRepository,
} from '../../repositories/notification/notification_repository';

import {
	UserRepository,
} from '../../repositories/user/user_repository';

import {
	generateId,
} from '../../utils/id';

import type {
	LocalizedPushText,
	PushLocale,
	PushText,
} from '../../types/notification/push';

const TITLE_MAX_LENGTH =
	100;

const MESSAGE_MAX_LENGTH =
	1000;

export type SystemNotificationDispatch =
	| {
		kind: 'user';
		receiverId: string;
		notificationId: string;
		defaultText: PushText;
		translations?: LocalizedPushText;
	}
	| {
		kind: 'broadcast';
		defaultText: PushText;
		translations?: LocalizedPushText;
	};

export class NotificationService {
	private readonly repository:
		NotificationRepository;

	private readonly userRepository:
		UserRepository;

	constructor(
		db: D1Database,
	) {
		this.repository =
			new NotificationRepository(
				db,
			);

		this.userRepository =
			new UserRepository(
				db,
			);
	}

	// ============================================================
	// Internal system notification
	// ============================================================

	async createSystemNotification(
		input: unknown,
	): Promise<{
		createdCount: number;
		dispatch:
			SystemNotificationDispatch;
	}> {
		const body =
			requireObject(input);

		const defaultText: PushText = {
			title:
				requireText(
					body.title,
					'Title is required',
				),
			body:
				requireText(
					body.message,
					'Message is required',
				),
		};

		validateTextLimits(
			defaultText,
		);

		const translations =
			parseTranslations(
				body.translations,
			);

		const broadcast =
			body.broadcast === true;

		const receiverId =
			optionalText(
				body.receiverId,
			);

		// exactly one target mode
		if (
			broadcast ===
			(receiverId !== null)
		) {
			throw new NotificationServiceError(
				'Specify either broadcast=true or receiverId',
				400,
			);
		}

		if (broadcast) {
			const createdCount =
				await this.repository
					.broadcastSystem(
						defaultText.title,
						defaultText.body,
					);

			return {
				createdCount,
				dispatch: {
					kind:
						'broadcast',
					defaultText,
					translations,
				},
			};
		}

		const exists =
			await this.userRepository
				.existsById(
					receiverId!,
				);

		if (!exists) {
			throw new NotificationServiceError(
				'User not found',
				404,
			);
		}

		const notificationId =
			generateId();

		await this.repository
			.createSystemForUser({
				id:
					notificationId,
				receiverId:
					receiverId!,
				title:
					defaultText.title,
				message:
					defaultText.body,
			});

		return {
			createdCount: 1,
			dispatch: {
				kind:
					'user',
				receiverId:
					receiverId!,
				notificationId,
				defaultText,
				translations,
			},
		};
	}
}

// ============================================================
// Validation
// ============================================================

function parseTranslations(
	value: unknown,
): LocalizedPushText | undefined {
	if (
		value === undefined ||
		value === null
	) {
		return undefined;
	}

	const object =
		requireObject(value);

	const result:
		LocalizedPushText = {};

	for (const locale of [
		'en',
		'zh_Hans',
		'zh_Hant',
	] as const satisfies readonly PushLocale[]) {
		const raw =
			object[locale];

		if (
			raw === undefined ||
			raw === null
		) {
			continue;
		}

		const translated =
			requireObject(raw);

		const text: PushText = {
			title:
				requireText(
					translated.title,
					`${locale}.title is required`,
				),
			body:
				requireText(
					translated.message ??
						translated.body,
					`${locale}.message is required`,
				),
		};

		validateTextLimits(text);

		result[locale] =
			text;
	}

	return Object.keys(result)
		.length > 0
		? result
		: undefined;
}

function validateTextLimits(
	text: PushText,
): void {
	if (
		text.title.length >
		TITLE_MAX_LENGTH
	) {
		throw new NotificationServiceError(
			`Title must be at most ${TITLE_MAX_LENGTH} characters`,
			400,
		);
	}

	if (
		text.body.length >
		MESSAGE_MAX_LENGTH
	) {
		throw new NotificationServiceError(
			`Message must be at most ${MESSAGE_MAX_LENGTH} characters`,
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
		throw new NotificationServiceError(
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
		throw new NotificationServiceError(
			message,
			400,
		);
	}

	const result =
		value.trim();

	if (!result) {
		throw new NotificationServiceError(
			message,
			400,
		);
	}

	return result;
}

function optionalText(
	value: unknown,
): string | null {
	if (
		value === undefined ||
		value === null
	) {
		return null;
	}

	if (typeof value !== 'string') {
		throw new NotificationServiceError(
			'Invalid text value',
			400,
		);
	}

	const result =
		value.trim();

	return result || null;
}

export class NotificationServiceError
	extends Error {
	constructor(
		message: string,
		public readonly status:
			number,
	) {
		super(message);
		this.name =
			'NotificationServiceError';
	}
}
