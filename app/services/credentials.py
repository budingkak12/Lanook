from __future__ import annotations

from typing import Optional

import keyring


SERVICE_NAME = "mediaapp"


def _smb_secret_key(host: str, share: str, username: str | None) -> str:
    user = username or "anonymous"
    return f"smb://{host}/{share}:{user}"


def store_smb_password(host: str, share: str, username: str | None, password: str | None) -> None:
    if not username or not password:
        return
    key = _smb_secret_key(host, share, username)
    keyring.set_password(SERVICE_NAME, key, password)


def get_smb_password(host: str, share: str, username: str | None) -> Optional[str]:
    if not username:
        return None
    key = _smb_secret_key(host, share, username)
    return keyring.get_password(SERVICE_NAME, key)

