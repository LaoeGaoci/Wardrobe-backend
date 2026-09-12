export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUserRow {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string;
}

export interface RegisterInput {
  email: string;
  verificationCode: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateUserInput {
  username: string;
}

export interface CreateUserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
}