import axiosInstance from "./axiosInstance";

export const getUnits = (params) => axiosInstance.get("units/", { params });
export const createUnit = (data) => axiosInstance.post("units/", data);
export const updateUnit = (id, data) => axiosInstance.patch(`units/${id}/`, data);
export const deleteUnit = (id) => axiosInstance.delete(`units/${id}/`);
export const reorderUnits = (ids) => axiosInstance.post("units/reorder/", { ids });

export const getDepartments = (params) => axiosInstance.get("departments/", { params });
export const createDepartment = (data) => axiosInstance.post("departments/", data);
export const updateDepartment = (id, data) => axiosInstance.patch(`departments/${id}/`, data);
export const deleteDepartment = (id) => axiosInstance.delete(`departments/${id}/`);
export const reorderDepartments = (ids) => axiosInstance.post("departments/reorder/", { ids });

export const getOrgRoles = (params) => axiosInstance.get("org-roles/", { params });
export const createOrgRole = (data) => axiosInstance.post("org-roles/", data);
export const updateOrgRole = (id, data) => axiosInstance.patch(`org-roles/${id}/`, data);
export const deleteOrgRole = (id) => axiosInstance.delete(`org-roles/${id}/`);
export const getOrgRolesHierarchy = () => axiosInstance.get("org-roles/hierarchy/");
export const getAssignableRoles = () => axiosInstance.get("org-roles/assignable/");

export const getEmployees = (params) => axiosInstance.get("employees/", { params });
export const getEmployee = (id) => axiosInstance.get(`employees/${id}/`);
export const deleteEmployee = (id) => axiosInstance.delete(`employees/${id}/`);

export const getOrgPermissions = () => axiosInstance.get("org-permissions/");
