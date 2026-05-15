from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

admin.site.site_header = "CK — Управление проектом"
admin.site.site_title = "CK Admin"
admin.site.index_title = "Панель управления"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/textbooks/", include("apps.textbooks.urls")),
    path("api/shop/", include("apps.shop.urls")),
    path("api/feedback/", include("apps.feedback.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
]

urlpatterns += [
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
