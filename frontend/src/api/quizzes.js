import api from "./axiosInstance";

const BASE = "textbooks/quizzes";

// ─── Settings ────────────────────────────────────────────
export const getQuizSettings = () => api.get("textbooks/settings/");

// ─── Templates ───────────────────────────────────────────
export const getTemplates = (params) => api.get(`${BASE}/templates/`, { params });
export const getTemplate = (id) => api.get(`${BASE}/templates/${id}/`);
export const createTemplate = (data) => api.post(`${BASE}/templates/`, data);
export const updateTemplate = (id, data) => api.patch(`${BASE}/templates/${id}/`, data);
export const deleteTemplate = (id) => api.delete(`${BASE}/templates/${id}/`);
export const reorderQuestions = (templateId, order) =>
  api.post(`${BASE}/templates/${templateId}/reorder-questions/`, { order });

// ─── Questions ───────────────────────────────────────────
export const getQuestions = (templateId) =>
  api.get(`${BASE}/questions/`, { params: { template: templateId } });
export const addQuestion = (data) => api.post(`${BASE}/questions/`, data);
export const updateQuestion = (id, data) => api.patch(`${BASE}/questions/${id}/`, data);
export const deleteQuestion = (id) => api.delete(`${BASE}/questions/${id}/`);

// ─── Options ─────────────────────────────────────────────
export const addOption = (data) => api.post(`${BASE}/options/`, data);
export const updateOption = (id, data) => api.patch(`${BASE}/options/${id}/`, data);
export const deleteOption = (id) => api.delete(`${BASE}/options/${id}/`);

// ─── Materials (textbook cards) ──────────────────────────
export const getMaterials = (templateId) =>
  api.get(`${BASE}/template-materials/`, { params: { template: templateId } });
export const addMaterial = (data) => api.post(`${BASE}/template-materials/`, data);
export const deleteMaterial = (id) => api.delete(`${BASE}/template-materials/${id}/`);

// ─── Files ───────────────────────────────────────────────
export const getFiles = (templateId) =>
  api.get(`${BASE}/template-files/`, { params: { template: templateId } });
export const uploadFile = (templateId, formData) =>
  api.post(`${BASE}/template-files/?template=${templateId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
export const deleteFile = (id) => api.delete(`${BASE}/template-files/${id}/`);

// ─── Links ───────────────────────────────────────────────
export const getLinks = (templateId) =>
  api.get(`${BASE}/template-links/`, { params: { template: templateId } });
export const addLink = (data) => api.post(`${BASE}/template-links/`, data);
export const deleteLink = (id) => api.delete(`${BASE}/template-links/${id}/`);

// ─── Assignments ─────────────────────────────────────────
export const getAssignments = (params) => api.get(`${BASE}/assignments/`, { params });
export const createAssignment = (data) => api.post(`${BASE}/assignments/`, data);
export const deleteAssignment = (id) => api.delete(`${BASE}/assignments/${id}/`);

// ─── Employee: My Tests ──────────────────────────────────
export const getMyTests = (params) => api.get(`${BASE}/my-tests/`, { params });

// ─── Employee: Attempt lifecycle ─────────────────────────
export const startAttempt = (assignmentId) =>
  api.post(`${BASE}/attempts/`, { assignment: assignmentId });

export const getNextQuestion = (attemptId) =>
  api.get(`${BASE}/attempts/${attemptId}/next-question/`);

export const submitAnswer = (attemptId, data) =>
  api.post(`${BASE}/attempts/${attemptId}/answer/`, data);

export const completeAttempt = (attemptId) =>
  api.post(`${BASE}/attempts/${attemptId}/complete/`);

// ─── Violation logging ───────────────────────────────────
export const logViolation = (attemptId, data) =>
  api.post(`${BASE}/attempts/${attemptId}/violation/`, data);

export const logViolationBeacon = (attemptId, data) => {
  const url = `${api.defaults.baseURL}${BASE}/attempts/${attemptId}/violation/`;
  const token = localStorage.getItem("accessToken");
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
    keepalive: true,
  }).catch(() => {});
};

// ─── Result (employee's own attempt) ─────────────────────
export const getMyAttemptResult = (attemptId) =>
  api.get(`${BASE}/attempts/${attemptId}/my-result/`);

// ─── Results (manager) ───────────────────────────────────
export const getQuizResults = (params) => api.get(`${BASE}/results/`, { params });
export const getAttemptReview = (attemptId) =>
  api.get(`${BASE}/attempts/${attemptId}/review/`);
