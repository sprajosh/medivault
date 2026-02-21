import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";

interface UseAuthGuardOptions {
  redirectTo?: string;
  requireAuth?: boolean;
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const { redirectTo = "/login", requireAuth = true } = options;
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (requireAuth && !currentUser) {
        router.push(redirectTo);
      } else if (!requireAuth && currentUser) {
        router.push("/dashboard");
      }
    }
  }, [currentUser, loading, router, redirectTo, requireAuth]);

  return { currentUser, loading };
}

export function AuthGuard({ 
  children, 
  requireAuth = true,
  fallback = null 
}: { 
  children: React.ReactNode; 
  requireAuth?: boolean;
  fallback?: React.ReactNode;
}) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (requireAuth && !currentUser) {
    return fallback || <LoadingSpinner fullScreen />;
  }

  if (!requireAuth && currentUser) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
