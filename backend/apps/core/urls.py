from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AcceptInviteView,
    CheckDevView,
    CompanyViewSet,
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    DepartmentViewSet,
    DevContextOptionsView,
    EmployeeAssignmentViewSet,
    EmployeeViewSet,
    InviteViewSet,
    MeViewSet,
    OrgPermissionViewSet,
    OrgRoleViewSet,
    RegisterView,
    UnitViewSet,
    ZoneViewSet,
)

router = DefaultRouter()
router.register("units", UnitViewSet, basename="unit")
router.register("departments", DepartmentViewSet, basename="department")
router.register("org-roles", OrgRoleViewSet, basename="org-role")
router.register("org-permissions", OrgPermissionViewSet, basename="org-permission")
router.register("employees", EmployeeViewSet, basename="employee")
router.register("employee-assignments", EmployeeAssignmentViewSet, basename="employee-assignment")
router.register("invites", InviteViewSet, basename="invite")
router.register("zones", ZoneViewSet, basename="zone")
router.register("companies", CompanyViewSet, basename="company")
router.register("me", MeViewSet, basename="me")

urlpatterns = [
    path("auth/register/", RegisterView.as_view()),
    path("auth/accept-invite/", AcceptInviteView.as_view()),
    path("auth/login/", CustomTokenObtainPairView.as_view()),
    path("auth/refresh/", CustomTokenRefreshView.as_view()),
    path("auth/check-dev/", CheckDevView.as_view()),
    path("auth/dev-context/", DevContextOptionsView.as_view()),
] + router.urls
