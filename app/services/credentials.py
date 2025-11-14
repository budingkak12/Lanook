from __future__ import annotations

from typing import Optional
import os

import keyring
from keyring.errors import KeyringError, PasswordDeleteError


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
    pwd = keyring.get_password(SERVICE_NAME, key)
    if pwd:
        return pwd
    # 环境变量兜底（便于无钥匙串/CI 环境）
    # 精确匹配：MEDIAAPP_SMB_PASSWORD_<HOST>_<SHARE>_<USER>
    def norm(s: str) -> str:
        return "".join(ch if ch.isalnum() else "_" for ch in s)
    candidates = [
        f"MEDIAAPP_SMB_PASSWORD_{norm(host)}_{norm(share)}_{norm(username)}",
        f"MEDIAAPP_SMB_PASSWORD_{norm(host)}_{norm(username)}",
        "MEDIAAPP_SMB_PASSWORD",
    ]
    for env_key in candidates:
        val = os.environ.get(env_key)
        if val:
            return val
    return None


def clear_smb_password(host: str, share: str, username: str | None) -> None:
    if not username:
        return
    key = _smb_secret_key(host, share, username)
    try:
        keyring.delete_password(SERVICE_NAME, key)
    except (PasswordDeleteError, KeyringError):
        pass
