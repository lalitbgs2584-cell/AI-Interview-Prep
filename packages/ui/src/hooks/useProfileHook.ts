// lib/hooks/useProfileData.ts
import { useEffect, useState } from "react";

export interface ProfileData {
  user: {
    name?: string | null;
    avatar?: string | null;
    email?: string | null;
    role?: "USER" | "ADMIN" | null;
    createdAt?: Date | string | null;
    streak?: number;
    bestStreak?: number;
    lastLoginAt?: Date | string | null;
    activityMap?: Record<string, number>;
    skills?: Array<{ skill: { name: string; category?: string | null } }>;
    interviews?: any[];
    resumes?: any[];
  };
}

export function useProfileData() {
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/user/profile");

        if (!response.ok) {
          throw new Error(`Profile fetch failed: ${response.statusText}`);
        }

        const data = await response.json();
        setProfileData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
        console.error("Profile fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Function to manually update activity (call after interview completion)
  const updateActivity = async () => {
    try {
      const response = await fetch("/api/user/update-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to update activity");
      }

      const data = await response.json();

      // Update local state with new streak/activity data
      if (profileData) {
        setProfileData({
          ...profileData,
          user: {
            ...profileData.user,
            streak: data.streak,
            bestStreak: data.bestStreak,
            activityMap: data.activityMap,
          },
        });
      }

      return data;
    } catch (err) {
      console.error("Activity update error:", err);
      throw err;
    }
  };

  // Function to refetch profile (e.g., after major changes)
  const refetchProfile = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/user/profile");

      if (!response.ok) {
        throw new Error("Failed to refetch profile");
      }

      const data = await response.json();
      setProfileData(data);
      setError(null);
    } catch (err) {
      console.error("Profile refetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to reload profile");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    profileData,
    isLoading,
    error,
    updateActivity,
    refetchProfile,
  };
}