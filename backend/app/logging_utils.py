import re

from app.config import Config

_JWT_PATTERN = re.compile(
    r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
)


def redact_log_message(message):
    if not message:
        return message
    for secret in _secrets():
        message = message.replace(secret, "[REDACTED]")
    return _JWT_PATTERN.sub("[REDACTED]", message)


def _secrets():
    return [
        secret
        for secret in (Config.SUPABASE_KEY,)
        if secret
    ]