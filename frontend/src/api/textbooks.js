import axiosInstance from "./axiosInstance";

const BASE = "textbooks/";

export const getTextbookSettings = () => axiosInstance.get(`${BASE}settings/`);

export const getSections = (params) => axiosInstance.get(`${BASE}sections/`, { params });
export const createSection = (data) => axiosInstance.post(`${BASE}sections/`, data);
export const updateSection = (id, data) => axiosInstance.patch(`${BASE}sections/${id}/`, data);
export const deleteSection = (id) => axiosInstance.delete(`${BASE}sections/${id}/`);

export const getCategories = (params) => axiosInstance.get(`${BASE}categories/`, { params });
export const createCategory = (data) => axiosInstance.post(`${BASE}categories/`, data);
export const updateCategory = (id, data) => axiosInstance.patch(`${BASE}categories/${id}/`, data);
export const deleteCategory = (id) => axiosInstance.delete(`${BASE}categories/${id}/`);

export const getCards = (params) => axiosInstance.get(`${BASE}cards/`, { params });
export const getCard = (id) => axiosInstance.get(`${BASE}cards/${id}/`);
export const getMyAvailableCards = (params) => axiosInstance.get(`${BASE}cards/my-available/`, { params });
export const createCard = (data) => axiosInstance.post(`${BASE}cards/`, data);
export const updateCard = (id, data) => axiosInstance.patch(`${BASE}cards/${id}/`, data);
export const deleteCard = (id) => axiosInstance.delete(`${BASE}cards/${id}/`);
export const reorderCards = (items) => axiosInstance.post(`${BASE}cards/reorder/`, { items });

export const createParagraph = (data) => axiosInstance.post(`${BASE}paragraphs/`, data);
export const updateParagraph = (id, data) => axiosInstance.patch(`${BASE}paragraphs/${id}/`, data);
export const deleteParagraph = (id) => axiosInstance.delete(`${BASE}paragraphs/${id}/`);
export const uploadParagraphPhoto = (paragraphId, file) => {
  const fd = new FormData();
  fd.append("file", file);
  return axiosInstance.post(`${BASE}paragraphs/${paragraphId}/upload-photo/`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const deleteParagraphPhoto = (paragraphId) =>
  axiosInstance.delete(`${BASE}paragraphs/${paragraphId}/delete-photo/`);

export const getCardPhotos = (params) => axiosInstance.get(`${BASE}card-photos/`, { params });
export const uploadCardPhoto = (cardId, file) => {
  const fd = new FormData();
  fd.append("card", cardId);
  fd.append("file", file);
  return axiosInstance.post(`${BASE}card-photos/`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const deleteCardPhoto = (id) => axiosInstance.delete(`${BASE}card-photos/${id}/`);

export const getAssignments = (params) => axiosInstance.get(`${BASE}assignments/`, { params });
export const createAssignment = (data) => axiosInstance.post(`${BASE}assignments/`, data);
export const deleteAssignment = (id) => axiosInstance.delete(`${BASE}assignments/${id}/`);
export const bulkDeleteAssignments = (data) => axiosInstance.post(`${BASE}assignments/bulk-delete/`, data);

export const searchCards = (params) => axiosInstance.get(`${BASE}search/`, { params });
