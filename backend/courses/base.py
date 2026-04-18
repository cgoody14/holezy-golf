from abc import ABC, abstractmethod
from typing import Any


class BaseCourseAdapter(ABC):
    """
    One adapter per one-off course that doesn't fit a standard platform.
    Subclass this, implement the 3 abstract methods, register in registry.py.
    """

    course_id: str = ""      # must match platform_course_id in Course_Database
    course_name: str = ""    # human-readable, for logs

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    async def login(self, page: Any, credentials: dict) -> bool:
        """
        Log in to the course's booking site.

        credentials = {"email": str, "password": str}
        Returns True on success, False on failure.
        """

    @abstractmethod
    async def search_slots(
        self,
        page: Any,
        date: str,
        players: int,
        time_window: tuple[str, str],
    ) -> list[dict]:
        """
        Search for available tee times.

        date        = "YYYY-MM-DD"
        players     = 2
        time_window = ("06:00", "18:00")

        Returns list of slot dicts, e.g.:
          [{"time": "08:30", "price": 45.00, "slot_id": "...", "holes": 18}, ...]
        """

    @abstractmethod
    async def book_slot(self, page: Any, slot: dict, golfer_info: dict) -> dict:
        """
        Complete the booking for the chosen slot.

        slot        = one element from search_slots() return value
        golfer_info = {"name": str, "email": str, "phone": str}

        Returns {"success": bool, "confirmation": str, "error": str | None}
        """

    # ── Optional hooks ────────────────────────────────────────────────────────

    async def pre_search_hook(self, page: Any) -> None:
        """Called once right before search_slots(). Override for site-specific setup."""

    async def post_booking_hook(self, page: Any, result: dict) -> None:
        """Called after book_slot() regardless of success. Override for cleanup/logging."""
