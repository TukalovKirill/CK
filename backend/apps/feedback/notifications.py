from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def notify_wish_reply(wish):
    """
    Заготовка под уведомления.
    Отправляет WebSocket-сообщение автору пожелания о том, что менеджер ответил.
    Когда будет полноценная модель Notification — здесь же создаётся запись в БД.
    """
    if not wish.author_id:
        return

    channel_layer = get_channel_layer()
    user_group = f"user_{wish.author_id}_notifications"

    message = {
        "type": "broadcast_message",
        "entity": "wish_reply",
        "action": "created",
        "id": wish.pk,
        "title": f"Ответ на ваше пожелание ({wish.unit.name})",
        "message": wish.reply_text[:200],
    }

    try:
        async_to_sync(channel_layer.group_send)(user_group, message)
    except Exception:
        pass
