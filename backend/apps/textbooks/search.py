from difflib import SequenceMatcher

from .models import TextbookCard


def search_cards(queryset, query):
    if not query or len(query) < 2:
        return []

    tokens = query.lower().split()
    results = []

    cards = queryset.select_related("section", "category").prefetch_related("tags", "paragraphs", "photos")

    for card in cards:
        haystack_parts = [card.name.lower()]
        if card.section:
            haystack_parts.append(card.section.name.lower())
        if card.category:
            haystack_parts.append(card.category.name.lower())
        for tag in card.tags.all():
            haystack_parts.append(tag.tag.lower())
        for p in card.paragraphs.all():
            haystack_parts.append(p.label.lower())
            haystack_parts.append(p.text.lower())

        haystack = " ".join(haystack_parts)
        score = 0.0

        for token in tokens:
            if token in haystack:
                if f" {token} " in f" {haystack} ":
                    score += 1.0
                else:
                    score += 0.85
            else:
                best = 0.0
                for word in haystack.split():
                    ratio = SequenceMatcher(None, token, word).ratio()
                    best = max(best, ratio)
                if best >= 0.75:
                    score += best * 0.8

        if tokens:
            score /= len(tokens)

        if score >= 0.5:
            first_photo = card.photos.first()
            results.append({
                "id": card.id,
                "name": card.name,
                "section_name": card.section.name if card.section else None,
                "category_name": card.category.name if card.category else None,
                "first_photo": first_photo.file.url if first_photo else None,
                "score": round(score, 3),
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:50]
