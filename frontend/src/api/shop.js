import axiosInstance from "./axiosInstance";

const BASE = "shop/";

// Settings
export const getShopSettings = () => axiosInstance.get(`${BASE}settings/`);
export const updateShopSettings = (data) => axiosInstance.put(`${BASE}settings/`, data);

// Categories
export const getCategories = (params) => axiosInstance.get(`${BASE}categories/`, { params });
export const createCategory = (data) => axiosInstance.post(`${BASE}categories/`, data);
export const updateCategory = (id, data) => axiosInstance.patch(`${BASE}categories/${id}/`, data);
export const deleteCategory = (id) => axiosInstance.delete(`${BASE}categories/${id}/`);

// Items
export const getItems = (params) => axiosInstance.get(`${BASE}items/`, { params });
export const getItem = (id) => axiosInstance.get(`${BASE}items/${id}/`);
export const getAvailableItems = (params) => axiosInstance.get(`${BASE}items/available/`, { params });
export const createItem = (data) => {
  const fd = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      fd.append(key, value);
    }
  });
  return axiosInstance.post(`${BASE}items/`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const updateItem = (id, data) => {
  const fd = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      fd.append(key, value);
    }
  });
  return axiosInstance.patch(`${BASE}items/${id}/`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const deleteItem = (id) => axiosInstance.delete(`${BASE}items/${id}/`);

// Balance
export const getBalance = () => axiosInstance.get(`${BASE}balance/`);

// Coins
export const accrueCoins = (data) => axiosInstance.post(`${BASE}coins/accrue/`, data);
export const bulkAccrueCoins = (data) => axiosInstance.post(`${BASE}coins/bulk-accrue/`, data);

// Transactions
export const getTransactions = (params) => axiosInstance.get(`${BASE}transactions/`, { params });
export const getMyTransactions = () => axiosInstance.get(`${BASE}transactions/my/`);

// Orders
export const getOrders = (params) => axiosInstance.get(`${BASE}orders/`, { params });
export const createOrder = (data) => axiosInstance.post(`${BASE}orders/`, data);
export const approveOrder = (id) => axiosInstance.post(`${BASE}orders/${id}/approve/`);
export const rejectOrder = (id) => axiosInstance.post(`${BASE}orders/${id}/reject/`);

// My Items
export const getMyItems = () => axiosInstance.get(`${BASE}my-items/`);
export const activateItem = (id) => axiosInstance.post(`${BASE}my-items/${id}/activate/`);

// Refunds
export const getRefunds = (params) => axiosInstance.get(`${BASE}refunds/`, { params });
export const createRefund = (data) => axiosInstance.post(`${BASE}refunds/`, data);
export const approveRefund = (id) => axiosInstance.post(`${BASE}refunds/${id}/approve/`);
export const rejectRefund = (id) => axiosInstance.post(`${BASE}refunds/${id}/reject/`);

// Assignments
export const getAssignments = (params) => axiosInstance.get(`${BASE}assignments/`, { params });
export const createAssignment = (data) => axiosInstance.post(`${BASE}assignments/`, data);
export const deleteAssignment = (id) => axiosInstance.delete(`${BASE}assignments/${id}/`);
export const bulkDeleteAssignments = (data) => axiosInstance.post(`${BASE}assignments/bulk-delete/`, data);
