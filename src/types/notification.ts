export type NotificationType =
  | 'friend_request'
  | 'recommendation'
  | 'system_notification';

export interface NotificationRow {
  seq: number;
  id: string;
  receiver_id: string;
  type: NotificationType;
  resource_id: string | null;
  sender_id: string | null;
  title: string | null;
  message: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationWithSenderRow
  extends NotificationRow {
  sender_username: string | null;
  sender_avatar_url: string | null;
}

export interface NotificationSender {
  id: string;
  username: string;
  avatarUrl: string;
}

export interface AppNotification {
  seq: number;
  id: string;
  type: NotificationType;
  resourceId: string | null;
  title: string | null;
  message: string | null;
  sender: NotificationSender | null;
  createdAt: string;
}

export interface NotificationPollResult {
  notifications: AppNotification[];
  nextCursor: number;
}
