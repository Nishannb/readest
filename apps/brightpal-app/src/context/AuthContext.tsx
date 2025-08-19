'use client';

import React, { createContext, useState, useContext, ReactNode } from 'react';

type LocalUser = {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

interface AuthContextType {
  token: string | null;
  user: LocalUser | null;
  login: (token: string, user: LocalUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Authentication no longer required - provide fake authenticated user
  const [token, setToken] = useState<string | null>('local-token');
  const [user, setUser] = useState<LocalUser | null>({
    id: 'local-user-id',
    email: 'user@readest.local',
    full_name: 'Local User',
    avatar_url: null,
  });

  // No authentication logic needed - all users are automatically authenticated

  const login = (newToken: string, newUser: LocalUser) => {
    // No-op - authentication not required
  };

  const logout = async () => {
    // No-op - authentication not required
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
