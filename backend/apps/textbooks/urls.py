from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CardAssignmentViewSet,
    CardParagraphViewSet,
    CardPhotoViewSet,
    SearchView,
    TextbookCardViewSet,
    TextbookCategoryViewSet,
    TextbookSectionViewSet,
    TextbookSettingsView,
)

router = DefaultRouter()
router.register("sections", TextbookSectionViewSet, basename="textbook-section")
router.register("categories", TextbookCategoryViewSet, basename="textbook-category")
router.register("cards", TextbookCardViewSet, basename="textbook-card")
router.register("paragraphs", CardParagraphViewSet, basename="card-paragraph")
router.register("card-photos", CardPhotoViewSet, basename="card-photo")
router.register("assignments", CardAssignmentViewSet, basename="card-assignment")

urlpatterns = [
    path("settings/", TextbookSettingsView.as_view()),
    path("search/", SearchView.as_view()),
] + router.urls
