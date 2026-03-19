import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("bukkapay_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("bukkapay_token");
      const base = import.meta.env.BASE_URL ?? "/";
      window.location.href = base.endsWith("/") ? `${base}login` : `${base}/login`;
    }
    if (!error.response) {
      error.message = "Network error — could not reach the server. Please try again.";
    }
    return Promise.reject(error);
  }
);
