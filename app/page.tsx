"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function Home() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (currentUser) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
  }, [currentUser, loading, router]);

  return <LoadingSpinner fullScreen />;
}
