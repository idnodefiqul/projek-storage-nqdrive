import { createContext, useContext, type ReactNode } from "react";
import { useMe } from "../hooks/auth";

interface AuthContextValue {
  user: { id: number; username: string; email: string } | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Wraps the dashboard route tree. Calls GET /api/auth/me once; downstream components read
 * the result from context instead of each calling useMe() independently (avoids duplicate
 * requests and keeps a single source of truth for "who is logged in").
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used within an AuthProvider");
  return context;
}
