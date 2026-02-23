import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const apiClient = axios.create({
  baseURL: apiBaseUrl
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("epms_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
