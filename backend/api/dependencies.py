# backend/api/dependencies.py
# Re-exports from core.security for backward compatibility and clean dependency injection
from core.security import (
    oauth2_scheme,
    get_current_user,
    RoleChecker,
    verify_password,
    get_password_hash,
    create_access_token
)

__all__ = [
    "oauth2_scheme",
    "get_current_user",
    "RoleChecker",
    "verify_password",
    "get_password_hash",
    "create_access_token"
]