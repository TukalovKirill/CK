from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CoinAccrueView,
    CoinBalanceView,
    CoinBulkAccrueView,
    CoinTransactionViewSet,
    DepartmentColleaguesView,
    OrderViewSet,
    PurchasedItemViewSet,
    RefundRequestViewSet,
    ShopCategoryViewSet,
    ShopItemAssignmentViewSet,
    ShopItemViewSet,
    ShopSettingsView,
)

router = DefaultRouter()
router.register("categories", ShopCategoryViewSet, basename="shop-category")
router.register("items", ShopItemViewSet, basename="shop-item")
router.register("transactions", CoinTransactionViewSet, basename="coin-transaction")
router.register("orders", OrderViewSet, basename="shop-order")
router.register("my-items", PurchasedItemViewSet, basename="purchased-item")
router.register("refunds", RefundRequestViewSet, basename="refund-request")
router.register("assignments", ShopItemAssignmentViewSet, basename="shop-item-assignment")

urlpatterns = [
    path("settings/", ShopSettingsView.as_view()),
    path("balance/", CoinBalanceView.as_view()),
    path("coins/accrue/", CoinAccrueView.as_view()),
    path("coins/bulk-accrue/", CoinBulkAccrueView.as_view()),
    path("department-colleagues/", DepartmentColleaguesView.as_view()),
    path("aml/", include("apps.shop.aml.urls")),
] + router.urls
