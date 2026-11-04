import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, NetworkError, setSessionExpiredHandler } from '../api/client';
import * as session from './sessionStore';
import type { User } from './sessionStore';

type AuthState = {
  loading: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
};

type LoginResponse = { access_token: string; refresh_token: string; user: User };

const AuthContext = createContext<AuthState | null>(null);

async function registerDevice() {
  // The push token is added in M7, which needs an EAS development build.
  try {
    await api('/devices', {
      method: 'POST',
      body: { device_id: await session.getDeviceId(), push_token: null },
    });
  } catch {
    // Not worth failing a login over; it runs again on the next app start.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const logout = useCallback(async () => {
    const refreshToken = await session.getRefreshToken();
    await session.clearSession();
    setUser(null);
    if (refreshToken) {
      // Ends the session on the server too. With no signal the phone still logs out;
      // the server session then lapses after 14 idle days.
      api('/auth/logout', { method: 'POST', auth: false, body: { refresh_token: refreshToken } }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(logout);

    (async () => {
      // The cached profile keeps the user logged in with no signal; roads with the
      // worst coverage are exactly where this app gets used.
      if (await session.getRefreshToken()) {
        setUser(await session.loadUser());
        setLoading(false);
        try {
          const fresh = await api<User>('/me');
          await session.saveUser(fresh);
          setUser(fresh);
          await registerDevice();
        } catch (error) {
          if (!(error instanceof NetworkError)) console.warn('Could not refresh the profile', error);
        }
      }
      setLoading(false);
    })();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });
    await session.saveSession(result.access_token, result.refresh_token, result.user);
    setUser(result.user);
    await registerDevice();
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const updated = await api<User>('/me', { method: 'PATCH', body: { display_name: displayName } });
    await session.saveUser(updated);
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ loading, user, login, logout, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
