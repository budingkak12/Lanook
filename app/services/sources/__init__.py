from __future__ import annotations

from .registry import (
    FSProvider,
    ProviderCapability,
    available_providers,
    clear_provider_credentials,
    get_provider,
    get_provider_by_name,
    iter_bytes,
    list_provider_capabilities,
    read_bytes,
    register_provider,
    ro_fs_for_url,
    save_provider_credentials,
    stat_url,
)

# 导入具体 provider 以触发注册
from . import local_provider as _local_provider  # noqa: F401
from . import smb_provider as _smb_provider  # noqa: F401

__all__ = [
    "FSProvider",
    "ProviderCapability",
    "available_providers",
    "clear_provider_credentials",
    "get_provider",
    "get_provider_by_name",
    "iter_bytes",
    "list_provider_capabilities",
    "read_bytes",
    "register_provider",
    "ro_fs_for_url",
    "save_provider_credentials",
    "stat_url",
]

