import axios from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000/api/",
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const devContext = localStorage.getItem("devContext");
  if (devContext) config.headers["X-Dev-Context"] = devContext;

  return config;
});

let isRefreshing = false;
let pendingQueue = [];

function processQueue(error, token) {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  );
  pendingQueue = [];
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    const refresh = localStorage.getItem("refreshToken");
    if (!refresh) return Promise.reject(error);

    if (original.url?.includes("auth/refresh")) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((newAccess) => {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return axiosInstance(original);
      });
    }

    isRefreshing = true;
    original._retry = true;

    try {
      const res = await axiosInstance.post("auth/refresh/", { refresh });
      const newAccess = res.data.access;
      localStorage.setItem("accessToken", newAccess);
      if (res.data.refresh) {
        localStorage.setItem("refreshToken", res.data.refresh);
      }
      processQueue(null, newAccess);
      original.headers.Authorization = `Bearer ${newAccess}`;
      return axiosInstance(original);
    } catch (err) {
      processQueue(err, null);
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("devContext");
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default axiosInstance;
