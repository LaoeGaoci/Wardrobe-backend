export interface Env {
	DB: D1Database;

	IMAGES: R2Bucket;

	AUTH_SECRET: string;
}

export interface AppVariables {
	userId: string;
}

export type AppEnv = {
	Bindings: Env;
	Variables: AppVariables;
};