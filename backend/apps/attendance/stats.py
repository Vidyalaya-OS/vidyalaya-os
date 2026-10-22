from collections import Counter

from .models import ATTENDED, AttendanceRecord

STATUSES = [s for s, _ in AttendanceRecord.Status.choices]


def summarize(statuses):
    """Counts per status and the attended percentage (present + late over marked days)."""
    counts = Counter(statuses)
    marked = sum(counts.values())
    attended = sum(counts[s] for s in ATTENDED)
    return {
        **{s: counts.get(s, 0) for s in STATUSES},
        "marked_days": marked,
        "attended": attended,
        "percentage": round(attended * 100 / marked, 1) if marked else None,
    }
