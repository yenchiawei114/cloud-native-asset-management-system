import pytest
from app.core.limiter import limiter

# Disable rate limiting globally during test execution
limiter.enabled = False
