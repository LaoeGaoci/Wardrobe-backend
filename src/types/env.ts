export interface Env {
  DB: D1Database;
  AUTH_SECRET: string;
}

export interface AppVariables {
  userId: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};