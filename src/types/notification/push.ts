export type PushProvider =
	| 'fcm';

export type PushPlatform =
	| 'android';

export type PushLocale =
	| 'en'
	| 'zh_Hans'
	| 'zh_Hant';

export type PushNotificationType =
	| 'friend_request'
	| 'recommendation'
	| 'system_notification';

export interface PushDeviceRow {
	id: string;
	user_id: string;
	provider: PushProvider;
	platform: PushPlatform;
	token: string;
	locale: PushLocale;
	created_at: string;
	updated_at: string;
}

export interface PushText {
	title: string;
	body: string;
}

export type LocalizedPushText =
	Partial<
		Record<
			PushLocale,
			PushText
		>
	>;

export interface PushPayloadData {
	type: PushNotificationType;
	notificationId?: string;
	resourceId?: string;
}
