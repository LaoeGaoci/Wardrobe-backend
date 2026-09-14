export type VerificationPurpose =
  | 'register'
  | 'password_reset';

export interface VerificationCodeRow {
  id: string;

  email: string;

  purpose:
    VerificationPurpose;

  code_hash: string;

  expires_at: number;

  attempts: number;

  consumed_at:
    number | null;

  created_at: number;
}

export interface CreateVerificationCodeRecord {
  id: string;

  email: string;

  purpose:
    VerificationPurpose;

  codeHash: string;

  expiresAt: number;

  createdAt: number;
}