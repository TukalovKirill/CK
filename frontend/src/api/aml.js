import axiosInstance from "./axiosInstance";
const BASE = "shop/aml/";

export const getAMLSettings = () => axiosInstance.get(`${BASE}settings/`);
export const updateAMLSettings = (data) => axiosInstance.put(`${BASE}settings/`, data);
export const getAMLRules = () => axiosInstance.get(`${BASE}rules/`);
export const updateAMLRule = (id, data) => axiosInstance.patch(`${BASE}rules/${id}/`, data);
export const getFlaggedOperations = (params) => axiosInstance.get(`${BASE}flagged/`, { params });
export const getFlaggedOperation = (id) => axiosInstance.get(`${BASE}flagged/${id}/`);
export const reviewFlaggedOperation = (id, data) => axiosInstance.post(`${BASE}flagged/${id}/review/`, data);
export const getFlaggedAuditLog = (id) => axiosInstance.get(`${BASE}flagged/${id}/audit/`);
export const getAMLStats = () => axiosInstance.get(`${BASE}stats/`);
export const getAMLAuditLog = (params) => axiosInstance.get(`${BASE}audit-log/`, { params });
