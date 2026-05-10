from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import BroadcastMixin
from apps.core.permissions import (
    _is_full_access,
    get_user_unit_ids,
    scope_queryset_by_unit,
)

from .models import (
    CoinBalance,
    CoinTransaction,
    ItemActivation,
    Order,
    PurchasedItem,
    ShopCategory,
    ShopItem,
    ShopSettings,
)
from .permissions import (
    CanEditShop,
    CanManageCoins,
    CanManageOrders,
    CanViewShop,
)
from .serializers import (
    AccrueCoinsSerializer,
    BulkAccrueCoinsSerializer,
    CoinBalanceSerializer,
    CoinTransactionSerializer,
    CreateOrderSerializer,
    ItemActivationSerializer,
    OrderSerializer,
    PurchasedItemSerializer,
    ShopCategorySerializer,
    ShopCategoryWriteSerializer,
    ShopItemDetailSerializer,
    ShopItemListSerializer,
    ShopItemWriteSerializer,
    ShopSettingsSerializer,
)


# --- Settings ---

class ShopSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company = request.user.company
        if not company:
            return Response({"is_enabled": False, "purchase_mode": "confirmation"})
        settings_obj = getattr(company, "shop_settings", None)
        if settings_obj is None:
            return Response({"is_enabled": False, "purchase_mode": "confirmation"})
        return Response(ShopSettingsSerializer(settings_obj).data)

    def put(self, request):
        if not _is_full_access(request.user):
            from apps.core.permissions import has_org_permission
            if not has_org_permission(request.user, "shop.manage_all"):
                return Response(status=status.HTTP_403_FORBIDDEN)
        company = request.user.company
        settings_obj, _ = ShopSettings.objects.get_or_create(company=company)
        serializer = ShopSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# --- Categories ---

class ShopCategoryViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "shop_category"
    pagination_class = None

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [CanViewShop()]
        return [CanEditShop()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ShopCategoryWriteSerializer
        return ShopCategorySerializer

    def get_queryset(self):
        qs = ShopCategory.objects.filter(company=self.request.user.company)
        qs = scope_queryset_by_unit(qs, self.request.user, "shop.view")
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company)


# --- Items ---

class ShopItemViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "shop_item"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "available"):
            return [CanViewShop()]
        return [CanEditShop()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ShopItemWriteSerializer
        if self.action == "retrieve":
            return ShopItemDetailSerializer
        return ShopItemListSerializer

    def get_queryset(self):
        qs = ShopItem.objects.filter(company=self.request.user.company)
        if self.action == "available":
            qs = qs.filter(is_active=True)
        qs = scope_queryset_by_unit(qs, self.request.user, "shop.view")
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        category_id = self.request.query_params.get("category")
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company, created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def available(self, request):
        qs = self.get_queryset().filter(is_active=True)
        qs = qs.exclude(stock_quantity=0)
        serializer = ShopItemListSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)


# --- Balance ---

class CoinBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = getattr(request.user, "employee_profile", None)
        if not emp:
            return Response({"balance": 0})
        balance_obj, _ = CoinBalance.objects.get_or_create(
            employee=emp, defaults={"company": request.user.company}
        )
        return Response(CoinBalanceSerializer(balance_obj).data)


# --- Coins (Accrue) ---

class CoinAccrueView(APIView):
    permission_classes = [CanManageCoins]

    @transaction.atomic
    def post(self, request):
        serializer = AccrueCoinsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.core.models import Employee
        employee_id = serializer.validated_data["employee_id"]
        amount = serializer.validated_data["amount"]
        comment = serializer.validated_data.get("comment", "")

        try:
            employee = Employee.objects.get(pk=employee_id, company=request.user.company)
        except Employee.DoesNotExist:
            return Response(
                {"detail": "Сотрудник не найден"}, status=status.HTTP_404_NOT_FOUND
            )

        balance_obj, _ = CoinBalance.objects.get_or_create(
            employee=employee, defaults={"company": request.user.company}
        )
        balance_obj.balance += amount
        balance_obj.save(update_fields=["balance", "updated_at"])

        CoinTransaction.objects.create(
            employee=employee,
            company=request.user.company,
            amount=amount,
            transaction_type=CoinTransaction.TransactionType.ACCRUAL,
            comment=comment,
            created_by=request.user,
        )

        return Response({"balance": balance_obj.balance}, status=status.HTTP_200_OK)


class CoinBulkAccrueView(APIView):
    permission_classes = [CanManageCoins]

    @transaction.atomic
    def post(self, request):
        serializer = BulkAccrueCoinsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.core.models import Employee
        employee_ids = serializer.validated_data["employee_ids"]
        amount = serializer.validated_data["amount"]
        comment = serializer.validated_data.get("comment", "")

        employees = Employee.objects.filter(
            pk__in=employee_ids, company=request.user.company
        )
        results = []
        for employee in employees:
            balance_obj, _ = CoinBalance.objects.get_or_create(
                employee=employee, defaults={"company": request.user.company}
            )
            balance_obj.balance += amount
            balance_obj.save(update_fields=["balance", "updated_at"])

            CoinTransaction.objects.create(
                employee=employee,
                company=request.user.company,
                amount=amount,
                transaction_type=CoinTransaction.TransactionType.ACCRUAL,
                comment=comment,
                created_by=request.user,
            )
            results.append({"employee_id": employee.pk, "balance": balance_obj.balance})

        return Response({"results": results}, status=status.HTTP_200_OK)


# --- Transactions ---

class CoinTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CoinTransactionSerializer
    permission_classes = [CanViewShop]

    def get_queryset(self):
        user = self.request.user
        qs = CoinTransaction.objects.filter(company=user.company)

        if not _is_full_access(user):
            from apps.core.permissions import has_org_permission
            if has_org_permission(user, "shop.manage_coins"):
                unit_ids = get_user_unit_ids(user, "shop.manage_coins")
                if unit_ids is not None:
                    qs = qs.filter(employee__assignments__unit_id__in=unit_ids)
            else:
                emp = getattr(user, "employee_profile", None)
                if emp:
                    qs = qs.filter(employee=emp)
                else:
                    qs = qs.none()

        employee_id = self.request.query_params.get("employee")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        tx_type = self.request.query_params.get("type")
        if tx_type:
            qs = qs.filter(transaction_type=tx_type)
        return qs.distinct()

    @action(detail=False, methods=["get"])
    def my(self, request):
        emp = getattr(request.user, "employee_profile", None)
        if not emp:
            return Response([])
        qs = CoinTransaction.objects.filter(employee=emp).order_by("-created_at")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# --- Orders ---

class OrderViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "shop_order"
    http_method_names = ["get", "post"]

    def get_permissions(self):
        if self.action in ("approve", "reject"):
            return [CanManageOrders()]
        return [CanViewShop()]

    def get_serializer_class(self):
        if self.action == "create":
            return CreateOrderSerializer
        return OrderSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.filter(company=user.company).select_related("item", "employee")

        if not _is_full_access(user):
            from apps.core.permissions import has_org_permission
            if has_org_permission(user, "shop.manage_orders"):
                unit_ids = get_user_unit_ids(user, "shop.manage_orders")
                if unit_ids is not None:
                    qs = qs.filter(item__unit_id__in=unit_ids)
            else:
                emp = getattr(user, "employee_profile", None)
                if emp:
                    qs = qs.filter(employee=emp)
                else:
                    qs = qs.none()

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item_id = serializer.validated_data["item_id"]
        quantity = serializer.validated_data["quantity"]

        emp = getattr(request.user, "employee_profile", None)
        if not emp:
            return Response(
                {"detail": "Профиль сотрудника не найден"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            item = ShopItem.objects.get(
                pk=item_id, company=request.user.company, is_active=True
            )
        except ShopItem.DoesNotExist:
            return Response(
                {"detail": "Товар не найден"}, status=status.HTTP_404_NOT_FOUND
            )

        if item.stock_quantity != -1 and item.stock_quantity < quantity:
            return Response(
                {"detail": "Недостаточно товара на складе"}, status=status.HTTP_400_BAD_REQUEST
            )

        total_price = item.price * quantity

        balance_obj, _ = CoinBalance.objects.select_for_update().get_or_create(
            employee=emp, defaults={"company": request.user.company}
        )
        if balance_obj.balance < total_price:
            return Response(
                {"detail": "Недостаточно СК коинов"}, status=status.HTTP_400_BAD_REQUEST
            )

        settings_obj = getattr(request.user.company, "shop_settings", None)
        purchase_mode = settings_obj.purchase_mode if settings_obj else "confirmation"

        if purchase_mode == ShopSettings.PurchaseMode.INSTANT:
            order_status = Order.Status.COMPLETED
        else:
            order_status = Order.Status.PENDING

        balance_obj.balance -= total_price
        balance_obj.save(update_fields=["balance", "updated_at"])

        order = Order.objects.create(
            employee=emp,
            company=request.user.company,
            item=item,
            quantity=quantity,
            total_price=total_price,
            status=order_status,
        )

        CoinTransaction.objects.create(
            employee=emp,
            company=request.user.company,
            amount=-total_price,
            transaction_type=CoinTransaction.TransactionType.PURCHASE,
            comment=f"Покупка: {item.name} x{quantity}",
            related_order=order,
        )

        if purchase_mode == ShopSettings.PurchaseMode.INSTANT:
            if item.stock_quantity != -1:
                item.stock_quantity -= quantity
                item.save(update_fields=["stock_quantity"])
            PurchasedItem.objects.create(
                employee=emp,
                company=request.user.company,
                order=order,
                item=item,
                quantity_remaining=quantity,
            )

        self._broadcast("created", order.pk, extra={
            "sub_type": "shop_order_created",
            "employee_name": emp.full_name,
            "item_name": item.name,
            "total_price": total_price,
        })

        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        order = self.get_object()
        if order.status != Order.Status.PENDING:
            return Response(
                {"detail": "Заказ уже обработан"}, status=status.HTTP_400_BAD_REQUEST
            )

        order.status = Order.Status.COMPLETED
        order.reviewed_by = request.user
        order.reviewed_at = timezone.now()
        order.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        if order.item and order.item.stock_quantity != -1:
            order.item.stock_quantity -= order.quantity
            order.item.save(update_fields=["stock_quantity"])

        PurchasedItem.objects.create(
            employee=order.employee,
            company=order.company,
            order=order,
            item=order.item,
            quantity_remaining=order.quantity,
        )

        self._broadcast("updated", order.pk, extra={
            "sub_type": "shop_order_updated",
            "order_status": "completed",
            "employee_id": order.employee_id,
        })

        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        order = self.get_object()
        if order.status != Order.Status.PENDING:
            return Response(
                {"detail": "Заказ уже обработан"}, status=status.HTTP_400_BAD_REQUEST
            )

        order.status = Order.Status.REJECTED
        order.reviewed_by = request.user
        order.reviewed_at = timezone.now()
        order.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        balance_obj, _ = CoinBalance.objects.select_for_update().get_or_create(
            employee=order.employee, defaults={"company": order.company}
        )
        balance_obj.balance += order.total_price
        balance_obj.save(update_fields=["balance", "updated_at"])

        CoinTransaction.objects.create(
            employee=order.employee,
            company=order.company,
            amount=order.total_price,
            transaction_type=CoinTransaction.TransactionType.REFUND,
            comment=f"Возврат: заказ #{order.pk} отклонён",
            related_order=order,
            created_by=request.user,
        )

        self._broadcast("updated", order.pk, extra={
            "sub_type": "shop_order_updated",
            "order_status": "rejected",
            "employee_id": order.employee_id,
        })

        return Response(OrderSerializer(order, context={"request": request}).data)


# --- My Items ---

class PurchasedItemViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PurchasedItemSerializer
    permission_classes = [CanViewShop]

    def get_queryset(self):
        emp = getattr(self.request.user, "employee_profile", None)
        if not emp:
            return PurchasedItem.objects.none()
        return PurchasedItem.objects.filter(employee=emp).select_related("item")

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def activate(self, request, pk=None):
        purchased_item = self.get_object()

        if purchased_item.is_fully_activated:
            return Response(
                {"detail": "Товар полностью активирован"}, status=status.HTTP_400_BAD_REQUEST
            )

        if purchased_item.quantity_remaining <= 0:
            return Response(
                {"detail": "Нет доступных активаций"}, status=status.HTTP_400_BAD_REQUEST
            )

        emp = getattr(request.user, "employee_profile", None)

        purchased_item.quantity_remaining -= 1
        if purchased_item.quantity_remaining == 0:
            purchased_item.is_fully_activated = True
        purchased_item.save(update_fields=["quantity_remaining", "is_fully_activated"])

        ItemActivation.objects.create(
            purchased_item=purchased_item,
            employee=emp,
        )

        self._broadcast_activation(purchased_item, emp)

        return Response(PurchasedItemSerializer(purchased_item, context={"request": request}).data)

    def _broadcast_activation(self, purchased_item, emp):
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        company_id = self.request.user.company_id
        channel_layer = get_channel_layer()
        message = {
            "type": "broadcast_message",
            "entity": "shop_item_activation",
            "action": "created",
            "id": purchased_item.pk,
            "sub_type": "shop_item_activated",
            "employee_name": emp.full_name if emp else "",
            "item_name": purchased_item.item.name if purchased_item.item else "",
            "user_id": self.request.user.pk,
        }
        try:
            async_to_sync(channel_layer.group_send)(
                f"company_{company_id}_updates", message
            )
        except Exception:
            pass
