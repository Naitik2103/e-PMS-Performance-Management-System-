import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { normalizeRole } from "../constants/rbac";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const token = localStorage.getItem("epms_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await apiClient.get("/auth/me");
      const nextUser = response.data.user ? { ...response.data.user, role: normalizeRole(response.data.user.role) } : null;
      setUser(nextUser);
    } catch (error) {
      localStorage.removeItem("epms_token");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const login = async (email, password) => {
    const response = await apiClient.post("/auth/login", { email, password });
    localStorage.setItem("epms_token", response.data.token);
    const nextUser = response.data.user ? { ...response.data.user, role: normalizeRole(response.data.user.role) } : null;
    setUser(nextUser);
    return nextUser;
  };

  const logout = () => {
    apiClient.post("/auth/logout").catch(() => null).finally(() => {
      localStorage.removeItem("epms_token");
      setUser(null);
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
