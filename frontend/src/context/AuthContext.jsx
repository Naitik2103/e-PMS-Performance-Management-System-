import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { normalizeRole } from "../constants/rbac";

const AuthContext = createContext(null);

const TOKEN_KEY = "epms_token";
const PREAUTH_KEY = "epms_preauth_token";
const PREAUTH_USER_KEY = "epms_preauth_user";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preAuth, setPreAuth] = useState(null);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [activeCycle, setActiveCycle] = useState(null);

  const loadUser = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const preAuthToken = localStorage.getItem(PREAUTH_KEY);
    const preAuthUserRaw = localStorage.getItem(PREAUTH_USER_KEY);

    if (preAuthToken && preAuthUserRaw) {
      try {
        const parsed = JSON.parse(preAuthUserRaw);
        setPreAuth({
          token: preAuthToken,
          user: parsed,
          availableRoles: (parsed?.availableRoles || []).map((r) => normalizeRole(r))
        });
      } catch {
        localStorage.removeItem(PREAUTH_KEY);
        localStorage.removeItem(PREAUTH_USER_KEY);
      }
    }

    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await apiClient.get("/auth/me");
      const nextUser = response.data.user
        ? {
            ...response.data.user,
            role: normalizeRole(response.data.user.role),
            selectedRole: normalizeRole(response.data.user.selectedRole || response.data.user.role),
            availableRoles: (response.data.user.availableRoles || []).map((role) => normalizeRole(role))
          }
        : null;
      setUser(nextUser);

      // Fetch active cycle if user is authenticated
      try {
        const cycleResponse = await apiClient.get("/auth/active-cycle");
        console.log("📅 Active Cycle Response:", cycleResponse.data);
        if (cycleResponse.data) {
          console.log("✅ Active cycle fetched successfully");
          console.log("  Goal Setting: ", cycleResponse.data.goalSettingStart, " to ", cycleResponse.data.goalSettingEnd);
          console.log("  Six-Month Review: ", cycleResponse.data.sixMonthProgressReviewStart, " to ", cycleResponse.data.sixMonthProgressReviewEnd);
          console.log("  Annual Appraisal: ", cycleResponse.data.annualAppraisalStart, " to ", cycleResponse.data.annualAppraisalEnd);
        } else {
          console.log("⚠️ No active cycle found");
        }
        setActiveCycle(cycleResponse.data || null);
      } catch (cycleError) {
        console.error("❌ Failed to fetch active cycle:", cycleError);
        setActiveCycle(null);
      }
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const login = async (email, password) => {
    const response = await apiClient.post("/auth/login", { email, password });
    if (response.data.token) {
      // Default login: employee for non-admin; admin returns admin role.
      localStorage.setItem(TOKEN_KEY, response.data.token);
      localStorage.removeItem(PREAUTH_KEY);
      localStorage.removeItem(PREAUTH_USER_KEY);
      const nextUser = response.data.user
        ? {
            ...response.data.user,
            role: normalizeRole(response.data.user.role),
            selectedRole: normalizeRole(response.data.user.selectedRole || response.data.user.role),
            availableRoles: (response.data.user.availableRoles || []).map((role) => normalizeRole(role))
          }
        : null;
      setPreAuth(null);
      setUser(nextUser);

      // Fetch active cycle after login
      try {
        const cycleResponse = await apiClient.get("/auth/active-cycle");
        setActiveCycle(cycleResponse.data || null);
      } catch {
        setActiveCycle(null);
      }

      setAuthEpoch((e) => e + 1);
      return { type: "auth", user: nextUser };
    }

    throw new Error("Unexpected login response");
  };

  const selectRole = async (role) => {
    const preAuthToken = localStorage.getItem(PREAUTH_KEY);
    if (!preAuthToken) throw new Error("Missing pre-auth token");

    const response = await apiClient.post(
      "/auth/select-role",
      { role },
      { headers: { Authorization: `Bearer ${preAuthToken}` } }
    );
    localStorage.setItem(TOKEN_KEY, response.data.token);
    localStorage.removeItem(PREAUTH_KEY);
    localStorage.removeItem(PREAUTH_USER_KEY);
    const nextUser = response.data.user
      ? {
          ...response.data.user,
          role: normalizeRole(response.data.user.role),
          selectedRole: normalizeRole(response.data.user.selectedRole || response.data.user.role),
          availableRoles: (response.data.user.availableRoles || []).map((item) => normalizeRole(item))
        }
      : null;
    setUser(nextUser);
    setPreAuth(null);

    // Fetch active cycle after role selection
    try {
      const cycleResponse = await apiClient.get("/auth/active-cycle");
      setActiveCycle(cycleResponse.data || null);
    } catch {
      setActiveCycle(null);
    }

    setAuthEpoch((e) => e + 1);
    return nextUser;
  };

  const switchRole = async (role) => {
    const response = await apiClient.post("/auth/switch-role", { role });
    localStorage.setItem(TOKEN_KEY, response.data.token);
    const nextUser = response.data.user
      ? {
          ...response.data.user,
          role: normalizeRole(response.data.user.role),
          selectedRole: normalizeRole(response.data.user.selectedRole || response.data.user.role),
          availableRoles: (response.data.user.availableRoles || []).map((item) => normalizeRole(item))
        }
      : null;
    setUser(nextUser);

    // Fetch active cycle after role switch
    try {
      const cycleResponse = await apiClient.get("/auth/active-cycle");
      setActiveCycle(cycleResponse.data || null);
    } catch {
      setActiveCycle(null);
    }

    setAuthEpoch((e) => e + 1);
    return nextUser;
  };

  const logout = () => {
    apiClient.post("/auth/logout").catch(() => null).finally(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PREAUTH_KEY);
      localStorage.removeItem(PREAUTH_USER_KEY);
      setUser(null);
      setPreAuth(null);
      setActiveCycle(null);
      setAuthEpoch((e) => e + 1);
    });
  };

  return (
    <AuthContext.Provider value={{ user, preAuth, authEpoch, loading, activeCycle, login, logout, selectRole, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
