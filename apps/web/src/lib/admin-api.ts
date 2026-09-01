import type {
  AdminDashboardStats,
  AppUser,
  AuthForgotPasswordRequest,
  AuthLoginRequest,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthResetPasswordRequest,
  AuthResponse,
  AuthVerifyEmailRequest,
  CreatePlanRequest,
  SubscriptionPlan,
  UpdatePlanRequest,
} from "@zegbot/shared";
import { API } from "./api";
import {
  clearSession,
  endAllSessions,
  endSession,
  getAccessToken,
  storeSession,
} from "./session";

function adminHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const msg = (data as { message?: string | string[] }).message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg) return msg;
  return fallback;
}

export async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return getAccessToken("admin");
}

export async function getUserToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return getAccessToken("user");
}

export function clearAdminToken() {
  clearSession("admin");
  void endSession("admin");
}

export function clearUserToken() {
  clearSession("user");
  void endSession("user");
}

export function logoutEverywhere(scope: "user" | "admin" = "user") {
  return endAllSessions(scope);
}

export async function adminLogin(body: AuthLoginRequest): Promise<AuthResponse> {
  const res = await fetch(`${API}/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Invalid admin login"));
  const data = (await res.json()) as AuthResponse;
  storeSession("admin", data);
  return data;
}

export async function userLogin(body: AuthLoginRequest): Promise<AuthResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Invalid login"));
  const data = (await res.json()) as AuthResponse;
  storeSession("user", data);
  return data;
}

export async function userRegister(
  body: AuthRegisterRequest,
): Promise<AuthRegisterResponse> {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not register"));
  return res.json();
}

export async function verifyEmail(
  body: AuthVerifyEmailRequest,
): Promise<AuthResponse> {
  const res = await fetch(`${API}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not verify email"));
  const data = (await res.json()) as AuthResponse;
  storeSession("user", data);
  return data;
}

export async function forgotPassword(
  body: AuthForgotPasswordRequest,
): Promise<{ message: string }> {
  const res = await fetch(`${API}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not send reset email"));
  return res.json();
}

export async function resetPassword(
  body: AuthResetPasswordRequest,
): Promise<{ message: string }> {
  const res = await fetch(`${API}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not reset password"));
  return res.json();
}

export async function fetchMe(token: string): Promise<AuthMeResponse> {
  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res, "Could not load account"));
  return res.json();
}

export async function fetchDashboard(token: string): Promise<AdminDashboardStats> {
  const res = await fetch(`${API}/admin/dashboard`, {
    headers: adminHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not load dashboard");
  return res.json();
}

export type AdminUserRow = AppUser & { planName: string; planSlug: string };

export async function fetchAdminUsers(token: string): Promise<AdminUserRow[]> {
  const res = await fetch(`${API}/admin/users`, {
    headers: adminHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not load users");
  return res.json();
}

export async function changeUserPlan(
  token: string,
  userId: string,
  planId: string,
): Promise<AdminUserRow> {
  const res = await fetch(`${API}/admin/users/${userId}/plan`, {
    method: "PATCH",
    headers: adminHeaders(token),
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw new Error("Could not change plan");
  return res.json();
}

export async function fetchAdminPlans(token: string): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${API}/admin/plans`, {
    headers: adminHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not load plans");
  return res.json();
}

export async function createPlan(
  token: string,
  body: CreatePlanRequest,
): Promise<SubscriptionPlan> {
  const res = await fetch(`${API}/admin/plans`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Could not create plan");
  return res.json();
}

export async function updatePlan(
  token: string,
  id: string,
  body: UpdatePlanRequest,
): Promise<SubscriptionPlan> {
  const res = await fetch(`${API}/admin/plans/${id}`, {
    method: "PATCH",
    headers: adminHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Could not update plan");
  return res.json();
}

export async function deletePlan(token: string, id: string): Promise<void> {
  const res = await fetch(`${API}/admin/plans/${id}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
  if (!res.ok) throw new Error("Could not delete plan");
}

export async function syncPlanStripe(
  token: string,
  planId: string,
): Promise<SubscriptionPlan> {
  const res = await fetch(`${API}/admin/plans/${planId}/sync-stripe`, {
    method: "POST",
    headers: adminHeaders(token),
  });
  if (!res.ok) throw new Error("Could not sync plan to Stripe");
  return res.json();
}

export async function createCheckout(planId: string, userToken: string): Promise<string> {
  const res = await fetch(`${API}/billing/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw new Error("Could not start checkout");
  const data = await res.json();
  return data.url as string;
}
