from apps.shop.permissions import ShopPermission


class CanReviewFlagged(ShopPermission):
    permission_code = "shop.review_flagged"


class CanManageAMLSettings(ShopPermission):
    permission_code = "shop.aml_settings"
