from __future__ import annotations
from typing import Type, TYPE_CHECKING

if TYPE_CHECKING:
    from .base import BaseCourseAdapter

_REGISTRY: dict[str, Type["BaseCourseAdapter"]] = {}


def register(cls: Type["BaseCourseAdapter"]) -> Type["BaseCourseAdapter"]:
    """Class decorator — adds the adapter to the registry keyed by course_id."""
    if not cls.course_id:
        raise ValueError(f"{cls.__name__} must define course_id")
    _REGISTRY[cls.course_id] = cls
    return cls


def get_adapter(course_id: str) -> Type["BaseCourseAdapter"] | None:
    """
    Return the adapter class for course_id, or None.
    None means: fall back to the standard platform booking engine.
    """
    return _REGISTRY.get(course_id)


# ── Register all adapters (add one line here per new course) ──────────────────
from .adapters import example_course  # noqa: E402, F401
