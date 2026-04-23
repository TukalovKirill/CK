import json

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from urllib.parse import parse_qs

from rest_framework_simplejwt.tokens import AccessToken


class CompanyUpdatesConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query = parse_qs(self.scope["query_string"].decode())
        token_str = query.get("token", [None])[0]

        if not token_str:
            await self.close()
            return

        try:
            access_token = AccessToken(token_str)
            user_id = access_token["user_id"]
            company_id = await self._get_company_id(user_id)
        except Exception:
            await self.close()
            return

        if not company_id:
            await self.close()
            return

        self.group_name = f"company_{company_id}_updates"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def broadcast_message(self, event):
        await self.send(text_data=json.dumps({
            "entity": event.get("entity"),
            "action": event.get("action"),
            "id": event.get("id"),
            "user_id": event.get("user_id"),
        }))

    @database_sync_to_async
    def _get_company_id(self, user_id):
        from .models import CustomUser

        try:
            user = CustomUser.objects.get(id=user_id)
            return user.company_id
        except CustomUser.DoesNotExist:
            return None
