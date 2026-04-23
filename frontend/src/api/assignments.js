import axiosInstance from "./axiosInstance";

export const deleteAssignment = (id) => axiosInstance.delete(`employee-assignments/${id}/`);
export const bulkCreateAssignments = (data) =>
  axiosInstance.post("employee-assignments/bulk_create/", data);
