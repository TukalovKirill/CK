from rest_framework.routers import DefaultRouter

from .views import StaffWishViewSet

router = DefaultRouter()
router.register("wishes", StaffWishViewSet, basename="staff-wish")

urlpatterns = router.urls
