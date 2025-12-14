// apps/api/src/modules/auth/auth.schemas.ts

export type RegisterBody = {
  username: string;
  password: string;
  captchaToken?: string;
};

export type LoginBody = {
  username: string;
  password: string;
  rememberMe?: boolean;
  captchaToken?: string;
};

export type AuthUserResponse = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: "user" | "commissioner" | "superadmin";
  createdAt: string;
};

export type MeResponse = {
  user: AuthUserResponse | null;
};
