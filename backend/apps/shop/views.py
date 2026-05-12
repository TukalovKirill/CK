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
    RefundRequest,
    ShopCategory,
    ShopItem,
    ShopItemAssignment,
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
    CreateRefundRequestSerializer,
    ItemActivationSerializer,
    OrderSerializer,
    PurchasedItemSerializer,
    RefundRequestSerializer,
    ShopCategorySerializer,
    ShopCategoryWriteSerializer,
    ShopItemAssignmentSerializer,
    ShopItemAssignmentWriteSerializer,
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

    def perform_update(self, serializer):
        instance = serializer.instance
        old_price = instance.price
        old_stock = instance.stock_quantity
        updated = serializer.save()
        from apps.shop.aml.item_tracking import track_price_change, track_stock_change
        ip = self.request.META.get("HTTP_X_FORWARDED_FOR", self.request.META.get("REMOTE_ADDR"))
        track_price_change(
            self.request.user.company, self.request.user,
            updated, old_price, updated.price, ip=ip,
        )
        track_stock_change(
            self.request.user.company, self.request.user,
            updated, old_stock, updated.stock_quantity, ip=ip,
        )

    @action(detail=False, methods=["get"])
    def available(self, request):
        from django.db.models import Q
        qs = self.get_queryset().filter(is_active=True)
        qs = qs.exclude(stock_quantity=0)

        emp = getattr(request.user, "employee_profile", None)
        if emp and not _is_full_access(request.user):
            from apps.core.models import EmployeeAssignment
            emp_assignments = EmployeeAssignment.objects.filter(employee=emp)
            q = Q()
            for ea in emp_assignments:
                q |= Q(assignments__unit=ea.unit, assignments__department__isnull=True, assignments__org_role__isnull=True)
                if ea.department:
                    q |= Q(assignments__unit=ea.unit, assignments__department=ea.department, assignments__org_role__isnull=True)
                    if ea.org_role:
                        q |= Q(assignments__unit=ea.unit, assignments__department=ea.department, assignments__org_role=ea.org_role)
            has_any_assignments = ShopItemAssignment.objects.filter(
                item__company=request.user.company,
            ).exists()
            if has_any_assignments:
                qs = qs.filter(q).distinct()

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

        from apps.shop.aml.engine import AMLEngine
        engine = AMLEngine(request.user.company)
        op_data = {
            "operation_type": "accrual",
            "amount": amount,
            "employee_id": employee.pk,
            "company_id": request.user.company_id,
            "initiated_by_id": request.user.pk,
            "comment": comment,
        }
        aml_result = engine.evaluate(op_data, request=request)
        if aml_result.should_block:
            engine.record(op_data, aml_result, request=request)
            return Response(
                {"detail": "Операция заблокирована системой безопасности", "flagged": True},
                status=status.HTTP_403_FORBIDDEN,
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

        from apps.shop.aml.engine import AMLEngine
        engine = AMLEngine(request.user.company)
        op_data = {
            "operation_type": "bulk_accrual",
            "amount": amount,
            "employee_ids": employee_ids,
            "employee_count": len(employee_ids),
            "company_id": request.user.company_id,
            "initiated_by_id": request.user.pk,
            "comment": comment,
        }
        aml_result = engine.evaluate(op_data, request=request)
        if aml_result.should_block:
            engine.record(op_data, aml_result, request=request)
            return Response(
                {"detail": "Операция заблокирована системой безопасности", "flagged": True},
                status=status.HTTP_403_FORBIDDEN,
            )

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

        from apps.shop.aml.engine import AMLEngine
        engine = AMLEngine(request.user.company)
        op_data = {
            "operation_type": "order_approve",
            "company_id": request.user.company_id,
            "initiated_by_id": request.user.pk,
            "employee_id": order.employee_id,
            "order_id": order.pk,
            "item_id": order.item_id,
            "total_price": order.total_price,
        }
        aml_result = engine.evaluate(op_data, request=request)
        if aml_result.should_block:
            engine.record(op_data, aml_result, request=request)
            return Response(
                {"detail": "Операция заблокирована системой безопасности", "flagged": True},
                status=status.HTTP_403_FORBIDDEN,
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


# --- Refunds ---

class RefundRequestViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "shop_refund"
    http_method_names = ["get", "post"]

    def get_permissions(self):
        if self.action in ("approve", "reject"):
            return [CanManageOrders()]
        return [CanViewShop()]

    def get_serializer_class(self):
        if self.action == "create":
            return CreateRefundRequestSerializer
        return RefundRequestSerializer

    def get_queryset(self):
        user = self.request.user
        qs = RefundRequest.objects.filter(company=user.company).select_related(
            "purchased_item__item", "employee", "reviewed_by"
        )

        if not _is_full_access(user):
            from apps.core.permissions import has_org_permission
            if has_org_permission(user, "shop.manage_orders"):
                unit_ids = get_user_unit_ids(user, "shop.manage_orders")
                if unit_ids is not None:
                    qs = qs.filter(purchased_item__item__unit_id__in=unit_ids)
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
        serializer = CreateRefundRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        purchased_item_id = serializer.validated_data["purchased_item_id"]
        reason = serializer.validated_data.get("reason", "")

        emp = getattr(request.user, "employee_profile", None)
        if not emp:
            return Response(
                {"detail": "Профиль сотрудника не найден"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            purchased_item = PurchasedItem.objects.get(
                pk=purchased_item_id, employee=emp
            )
        except PurchasedItem.DoesNotExist:
            return Response(
                {"detail": "Товар не найден"}, status=status.HTTP_404_NOT_FOUND
            )

        if purchased_item.is_fully_activated:
            return Response(
                {"detail": "Нельзя вернуть полностью активированный товар"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if purchased_item.activations.exists():
            return Response(
                {"detail": "Нельзя вернуть товар, который уже был активирован"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = RefundRequest.objects.filter(
            purchased_item=purchased_item, status=RefundRequest.Status.PENDING
        ).exists()
        if existing:
            return Response(
                {"detail": "Запрос на возврат уже создан"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refund_amount = purchased_item.order.total_price

        refund_req = RefundRequest.objects.create(
            purchased_item=purchased_item,
            employee=emp,
            company=request.user.company,
            reason=reason,
            refund_amount=refund_amount,
        )

        self._broadcast("created", refund_req.pk, extra={
            "sub_type": "shop_refund_created",
            "employee_name": emp.full_name,
            "item_name": purchased_item.item.name if purchased_item.item else "",
        })

        return Response(
            RefundRequestSerializer(refund_req, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        refund_req = self.get_object()
        if refund_req.status != RefundRequest.Status.PENDING:
            return Response(
                {"detail": "Запрос уже обработан"}, status=status.HTTP_400_BAD_REQUEST
            )

        purchased_item = refund_req.purchased_item

        from apps.shop.aml.engine import AMLEngine
        engine = AMLEngine(request.user.company)
        op_data = {
            "operation_type": "refund_approve",
            "company_id": request.user.company_id,
            "initiated_by_id": request.user.pk,
            "employee_id": refund_req.employee_id,
            "purchased_item_id": purchased_item.pk,
            "refund_request_id": refund_req.pk,
            "refund_amount": refund_req.refund_amount,
        }
        aml_result = engine.evaluate(op_data, request=request)
        if aml_result.should_block:
            engine.record(op_data, aml_result, request=request)
            return Response(
                {"detail": "Операция заблокирована системой безопасности", "flagged": True},
                status=status.HTTP_403_FORBIDDEN,
            )

        refund_req.status = RefundRequest.Status.APPROVED
        refund_req.reviewed_by = request.user
        refund_req.reviewed_at = timezone.now()
        refund_req.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        balance_obj, _ = CoinBalance.objects.select_for_update().get_or_create(
            employee=refund_req.employee, defaults={"company": refund_req.company}
        )
        balance_obj.balance += refund_req.refund_amount
        balance_obj.save(update_fields=["balance", "updated_at"])

        CoinTransaction.objects.create(
            employee=refund_req.employee,
            company=refund_req.company,
            amount=refund_req.refund_amount,
            transaction_type=CoinTransaction.TransactionType.REFUND,
            comment=f"Возврат товара: {purchased_item.item.name if purchased_item.item else 'удалён'}",
            related_order=purchased_item.order,
            created_by=request.user,
        )

        if purchased_item.item and purchased_item.item.stock_quantity != -1:
            purchased_item.item.stock_quantity += purchased_item.quantity_remaining
            purchased_item.item.save(update_fields=["stock_quantity"])

        purchased_item.delete()

        self._broadcast("updated", refund_req.pk, extra={
            "sub_type": "shop_refund_approved",
            "employee_id": refund_req.employee_id,
        })

        return Response(RefundRequestSerializer(refund_req, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        refund_req = self.get_object()
        if refund_req.status != RefundRequest.Status.PENDING:
            return Response(
                {"detail": "Запрос уже обработан"}, status=status.HTTP_400_BAD_REQUEST
            )

        refund_req.status = RefundRequest.Status.REJECTED
        refund_req.reviewed_by = request.user
        refund_req.reviewed_at = timezone.now()
        refund_req.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        self._broadcast("updated", refund_req.pk, extra={
            "sub_type": "shop_refund_rejected",
            "employee_id": refund_req.employee_id,
        })

        return Response(RefundRequestSerializer(refund_req, context={"request": request}).data)


# --- Item Assignments ---

class ShopItemAssignmentViewSet(BroadcastMixin, viewsets.ModelViewSet):
    broadcast_entity = "shop_item"
    http_method_names = ["get", "post", "delete"]
    permission_classes = [CanEditShop]

    def get_serializer_class(self):
        if self.action == "create":
            return ShopItemAssignmentWriteSerializer
        return ShopItemAssignmentSerializer

    def get_queryset(self):
        qs = ShopItemAssignment.objects.filter(
            item__company=self.request.user.company,
        ).select_related("item", "unit", "department", "org_role")
        unit_id = self.request.query_params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        item_id = self.request.query_params.get("item")
        if item_id:
            qs = qs.filter(item_id=item_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        unit_id = request.data.get("unit")
        department_id = request.data.get("department")
        if not unit_id:
            return Response({"detail": "unit обязателен"}, status=400)
        qs = ShopItemAssignment.objects.filter(
            item__company=request.user.company, unit_id=unit_id,
        )
        if department_id:
            qs = qs.filter(department_id=department_id)
        count = qs.count()
        qs.delete()
        self._broadcast("deleted")
        return Response({"deleted": count})
