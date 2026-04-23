import axiosInstance from "./axiosInstance";

export const login = async (email, password) => {
  const res = await axiosInstance.post("auth/login/", { email, password });
  localStorage.setItem("accessToken", res.data.access);
  localStorage.setItem("refreshToken", res.data.refresh);
  return res.data;
};

export const register = async ({ email, password, first_name, last_name, company_name }) => {
  const res = await axiosInstance.post("auth/register/", {
    email, password, first_name, last_name, company_name,
  });
  return res.data;
};

export const refreshToken = async () => {
  const refresh = localStorage.getItem("refreshToken");
  if (!refresh) return null;
  try {
    const res = await axiosInstance.post("auth/refresh/", { refresh });
    localStorage.setItem("accessToken", res.data.access);
    return res.data;
  } catch {
    return null;
  }
};

export const logout = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
};

export const acceptInvite = async (data) => {
  const res = await axiosInstance.post("auth/accept-invite/", data);
  return res.data;
};

export const checkDev = async (email, password) => {
  const res = await axiosInstance.post("auth/check-dev/", { email, password });
  return res.data;
};

export const devContextOptions = async (email, password, company_id) => {
  const res = await axiosInstance.post("auth/dev-context/", { email, password, company_id });
  return res.data;
};
