from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from rest_framework import status


class BroadcastMixin:
    broadcast_entity = None

    def _broadcast(self, action, entity_id=None, extra=None):
        if not self.broadcast_entity:
            return
        user = getattr(self.request, "user", None)
        company_id = getattr(user, "company_id", None)
        if not company_id:
            return
        channel_layer = get_channel_layer()
        message = {
            "type": "broadcast_message",
            "entity": self.broadcast_entity,
            "action": action,
            "id": entity_id,
            "user_id": user.pk if user else None,
        }
        if extra:
            message.update(extra)
        try:
            async_to_sync(channel_layer.group_send)(
                f"company_{company_id}_updates", message
            )
        except Exception:
            pass

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        if response.status_code == status.HTTP_201_CREATED:
            self._broadcast("created", response.data.get("id"))
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            self._broadcast("updated", response.data.get("id"))
        return response

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            self._broadcast("updated", response.data.get("id"))
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        entity_id = instance.pk
        response = super().destroy(request, *args, **kwargs)
        if response.status_code == status.HTTP_204_NO_CONTENT:
            self._broadcast("deleted", entity_id)
        return response


class CompanyScopedCreateMixin:
    def create(self, validated_data):
        request = self.context.get("request")
        if request and getattr(request.user, "company_id", None):
            model = self.Meta.model
            if any(f.name == "company" for f in model._meta.fields):
                validated_data["company"] = request.user.company
        return super().create(validated_data)
