"""Unit tests for the in-process sliding-window rate limiter."""
from ratelimit import SlidingWindowLimiter


class TestSlidingWindowLimiter:
    def test_allows_up_to_limit_within_window(self):
        limiter = SlidingWindowLimiter(limit=3, window_seconds=60)
        assert limiter.allow("a") is True
        assert limiter.allow("a") is True
        assert limiter.allow("a") is True
        assert limiter.allow("a") is False  # 4th hit exceeds budget

    def test_keys_are_isolated(self):
        limiter = SlidingWindowLimiter(limit=1, window_seconds=60)
        assert limiter.allow("a") is True
        assert limiter.allow("a") is False
        assert limiter.allow("b") is True  # different client unaffected

    def test_window_expires_and_budget_resets(self):
        import time
        limiter = SlidingWindowLimiter(limit=1, window_seconds=0.05)
        assert limiter.allow("a") is True
        assert limiter.allow("a") is False
        time.sleep(0.08)
        assert limiter.allow("a") is True  # old hits dropped

    def test_zero_limit_blocks_everything(self):
        limiter = SlidingWindowLimiter(limit=0, window_seconds=60)
        assert limiter.allow("a") is False
