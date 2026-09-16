import type {
	Env,
} from '../../types/env';

import type {
	LocalizedPushText,
	PushDeviceRow,
	PushLocale,
	PushNotificationType,
	PushPayloadData,
	PushText,
} from '../../types/notification/push';

import {
	NotificationRepository,
} from '../../repositories/notification/notification_repository';

import {
	PushDeviceRepository,
} from '../../repositories/notification/push_device_repository';

import {
	GoogleOAuthService,
} from './google_oauth_service';

const FCM_CHANNEL_ID =
	'wardrobe_notifications';

const SEND_CONCURRENCY =
	20;

export class PushService {
	private readonly notificationRepository:
		NotificationRepository;

	private readonly deviceRepository:
		PushDeviceRepository;

	private readonly oauth:
		GoogleOAuthService;

	constructor(
		private readonly env: Env,
	) {
		this.notificationRepository =
			new NotificationRepository(
				env.DB,
			);

		this.deviceRepository =
			new PushDeviceRepository(
				env.DB,
			);

		this.oauth =
			new GoogleOAuthService(env);
	}

	// ============================================================
	// Friend request
	// ============================================================

	async sendFriendRequest(
		input: {
			receiverId: string;
			senderUsername: string;
			resourceId: string;
		},
	): Promise<void> {
		const notificationId =
			await this.notificationRepository
				.findIdByResource(
					input.receiverId,
					'friend_request',
					input.resourceId,
				);

		await this.sendToUser({
			receiverId:
				input.receiverId,
			data: {
				type:
					'friend_request',
				notificationId:
					notificationId ??
					undefined,
				resourceId:
					input.resourceId,
			},
			textForLocale:
				(locale) =>
					friendRequestText(
						locale,
						input.senderUsername,
					),
		});
	}

	// ============================================================
	// Recommendation
	// ============================================================

	async sendRecommendation(
		input: {
			receiverId: string;
			senderUsername: string;
			resourceId: string;
		},
	): Promise<void> {
		const notificationId =
			await this.notificationRepository
				.findIdByResource(
					input.receiverId,
					'recommendation',
					input.resourceId,
				);

		await this.sendToUser({
			receiverId:
				input.receiverId,
			data: {
				type:
					'recommendation',
				notificationId:
					notificationId ??
					undefined,
				resourceId:
					input.resourceId,
			},
			textForLocale:
				(locale) =>
					recommendationText(
						locale,
						input.senderUsername,
					),
		});
	}

	// ============================================================
	// System notification
	// ============================================================

	async sendSystemToUser(
		input: {
			receiverId: string;
			notificationId?: string;
			defaultText: PushText;
			translations?: LocalizedPushText;
		},
	): Promise<void> {
		await this.sendToUser({
			receiverId:
				input.receiverId,
			data: {
				type:
					'system_notification',
				notificationId:
					input.notificationId,
			},
			textForLocale:
				(locale) =>
					input.translations?.[
						locale
					] ??
					input.defaultText,
		});
	}

	async sendSystemBroadcast(
		input: {
			defaultText: PushText;
			translations?: LocalizedPushText;
		},
	): Promise<void> {
		const devices =
			await this.deviceRepository
				.findAll();

		await this.sendToDevices(
			devices,
			{
				type:
					'system_notification',
			},
			(locale) =>
				input.translations?.[
					locale
				] ??
				input.defaultText,
		);
	}

	// ============================================================
	// Internal dispatch
	// ============================================================

	private async sendToUser(
		input: {
			receiverId: string;
			data: PushPayloadData;
			textForLocale:
				(locale: PushLocale) =>
					PushText;
		},
	): Promise<void> {
		const devices =
			await this.deviceRepository
				.findByUserId(
					input.receiverId,
				);

		await this.sendToDevices(
			devices,
			input.data,
			input.textForLocale,
		);
	}

	private async sendToDevices(
		devices: PushDeviceRow[],
		data: PushPayloadData,
		textForLocale:
			(locale: PushLocale) =>
				PushText,
	): Promise<void> {
		if (devices.length === 0) {
			return;
		}

		for (
			let start = 0;
			start < devices.length;
			start += SEND_CONCURRENCY
		) {
			const chunk =
				devices.slice(
					start,
					start +
						SEND_CONCURRENCY,
				);

			await Promise.allSettled(
				chunk.map(
					async (device) => {
						const text =
							textForLocale(
								device.locale,
							);

						await this.sendSingle(
							device,
							text,
							data,
						);
					},
				),
			);
		}
	}

	private async sendSingle(
		device: PushDeviceRow,
		text: PushText,
		data: PushPayloadData,
	): Promise<void> {
		let accessToken =
			await this.oauth
				.getAccessToken();

		let response =
			await this.sendRequest(
				accessToken,
				device,
				text,
				data,
			);

		if (response.status === 401) {
			this.oauth
				.invalidateCachedToken();

			accessToken =
				await this.oauth
					.getAccessToken();

			response =
				await this.sendRequest(
					accessToken,
					device,
					text,
					data,
				);
		}

		if (response.ok) {
			return;
		}

		const errorBody =
			await readJsonSafely(
				response,
			);

		const fcmErrorCode =
			extractFcmErrorCode(
				errorBody,
			);

		if (
			fcmErrorCode ===
				'UNREGISTERED'
		) {
			await this.deviceRepository
				.deleteByToken(
					device.token,
				);

			console.warn(
				'[PushService] removed invalid FCM token',
				{
					userId:
						device.user_id,
					fcmErrorCode,
				},
			);

			return;
		}

		console.error(
			'[PushService] FCM send failed',
			{
				status:
					response.status,
				userId:
					device.user_id,
				fcmErrorCode,
				error:
					errorBody,
			},
		);
	}

	private sendRequest(
		accessToken: string,
		device: PushDeviceRow,
		text: PushText,
		data: PushPayloadData,
	): Promise<Response> {
		const projectId =
			this.env.FCM_PROJECT_ID
				.trim();

		if (!projectId) {
			throw new PushServiceError(
				'FCM_PROJECT_ID is empty',
			);
		}

		const endpoint =
			`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

		const payloadData:
			Record<string, string> = {
				type:
					data.type,
				title:
					text.title,
				body:
					text.body,
			};

		if (data.notificationId) {
			payloadData.notificationId =
				data.notificationId;
		}

		if (data.resourceId) {
			payloadData.resourceId =
				data.resourceId;
		}

		return fetch(
			endpoint,
			{
				method: 'POST',
				headers: {
					Authorization:
						`Bearer ${accessToken}`,
					'Content-Type':
						'application/json',
				},
				body:
					JSON.stringify({
						message: {
							token:
								device.token,
							notification: {
								title:
									text.title,
								body:
									text.body,
							},
							data:
								payloadData,
							android: {
								priority:
									'high',
								notification: {
									channel_id:
										FCM_CHANNEL_ID,
								},
							},
						},
					}),
			},
		);
	}
}

function friendRequestText(
	locale: PushLocale,
	senderUsername: string,
): PushText {
	switch (locale) {
		case 'en':
			return {
				title:
					'New friend request',
				body:
					`${senderUsername} sent you a friend request`,
			};

		case 'zh_Hant':
			return {
				title:
					'新的好友申請',
				body:
					`${senderUsername} 向你傳送了好友申請`,
			};

		case 'zh_Hans':
		default:
			return {
				title:
					'新的好友请求',
				body:
					`${senderUsername} 向你发送了好友请求`,
			};
	}
}

function recommendationText(
	locale: PushLocale,
	senderUsername: string,
): PushText {
	switch (locale) {
		case 'en':
			return {
				title:
					'New clothing recommendation',
				body:
					`${senderUsername} sent you a clothing recommendation`,
			};

		case 'zh_Hant':
			return {
				title:
					'新的衣物推薦',
				body:
					`${senderUsername} 傳送了一份衣物推薦給你`,
			};

		case 'zh_Hans':
		default:
			return {
				title:
					'新的衣物推荐',
				body:
					`${senderUsername} 为你发送了一份衣物推荐`,
			};
	}
}

async function readJsonSafely(
	response: Response,
): Promise<unknown> {
	const text =
		await response.text();

	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function extractFcmErrorCode(
	body: unknown,
): string | null {
	if (
		!body ||
		typeof body !== 'object'
	) {
		return null;
	}

	const error =
		(body as Record<string, unknown>)
			.error;

	if (
		!error ||
		typeof error !== 'object'
	) {
		return null;
	}

	const details =
		(error as Record<string, unknown>)
			.details;

	if (!Array.isArray(details)) {
		return null;
	}

	for (const detail of details) {
		if (
			!detail ||
			typeof detail !== 'object'
		) {
			continue;
		}

		const record =
			detail as Record<
				string,
				unknown
			>;

		if (
			record['@type'] ===
				'type.googleapis.com/google.firebase.fcm.v1.FcmError' &&
			typeof record.errorCode ===
				'string'
		) {
			return record.errorCode;
		}
	}

	return null;
}

export class PushServiceError
	extends Error {
	constructor(
		message: string,
	) {
		super(message);
		this.name =
			'PushServiceError';
	}
}
