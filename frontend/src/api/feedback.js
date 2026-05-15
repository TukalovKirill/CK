import axiosInstance from "./axiosInstance";

const BASE = "feedback/wishes/";

export const getWishes = (params) => axiosInstance.get(BASE, { params });
export const submitWish = (data) => axiosInstance.post(BASE, data);
export const deleteWish = (id) => axiosInstance.delete(`${BASE}${id}/`);
export const replyToWish = (id, text) => axiosInstance.post(`${BASE}${id}/reply/`, { text });
