import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthMeResponse, AuthResponse } from "@zegbot/shared";
import { fetchMe, updateOnboarding, userLogin } from "./api";
import { getPendingEmail, setPendingEmail as persistPendingEmail } from "./onboarding";
import {
  clearStoredSession,
  endAllSessions,
  endSession,
  getAccessToken,
  storeSession,
} from "./session";
import { clearLegacyToken } from "./token";
import type { OnboardingUpdateRequest } from "@zegbot/shared";

type AuthContextValue = {
  token: string | null;
  user: AuthMeResponse | null;
  pendingEmail: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  setSession: (session: AuthResponse) => Promise<void>;
  refresh: () => Promise<void>;
  setPendingEmail: (email: string | null) => Promise<void>;
  saveOnboarding: (body: OnboardingUpdateRequest) => Promise<AuthMeResponse | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const [pendingEmail, setPendingEmailState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (value: string) => {
    const me = await fetchMe(value);
    setUser(me);
  }, []);

  const setPendingEmail = useCallback(async (email: string | null) => {
    await persistPendingEmail(email);
    setPendingEmailState(email);
  }, []);

  const setSession = useCallback(
    async (session: AuthResponse) => {
      await storeSession(session);
      setTokenState(session.token);
      await persistPendingEmail(null);
      setPendingEmailState(null);
      try {
        await loadUser(session.token);
      } catch {
        setUser(null);
      }
    },
    [loadUser],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await clearLegacyToken();
      // Trades the stored refresh token for an access token, so a returning
      // user goes straight to the app without logging in again.
      const [access, pending] = await Promise.all([
        getAccessToken(),
        getPendingEmail(),
      ]);
      if (cancelled) return;
      setPendingEmailState(pending);
      if (!access) {
        setLoading(false);
        return;
      }
      setTokenState(access);
      try {
        await loadUser(access);
      } catch {
        await clearStoredSession();
        if (!cancelled) {
          setTokenState(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await userLogin({ email, password });
      await setSession(res);
    },
    [setSession],
  );

  const clearLocal = useCallback(async () => {
    await persistPendingEmail(null);
    setTokenState(null);
    setUser(null);
    setPendingEmailState(null);
  }, []);

  const logout = useCallback(async () => {
    await endSession();
    await clearLocal();
  }, [clearLocal]);

  const logoutEverywhere = useCallback(async () => {
    await endAllSessions();
    await clearLocal();
  }, [clearLocal]);

  const refresh = useCallback(async () => {
    const access = await getAccessToken();
    if (!access) return;
    setTokenState(access);
    await loadUser(access);
  }, [loadUser]);

  const saveOnboarding = useCallback(
    async (body: OnboardingUpdateRequest) => {
      if (!token) return null;
      const me = await updateOnboarding(token, body);
      setUser(me);
      return me;
    },
    [token],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      pendingEmail,
      loading,
      login,
      logout,
      logoutEverywhere,
      setSession,
      refresh,
      setPendingEmail,
      saveOnboarding,
    }),
    [
      token,
      user,
      pendingEmail,
      loading,
      login,
      logout,
      logoutEverywhere,
      setSession,
      refresh,
      setPendingEmail,
      saveOnboarding,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
