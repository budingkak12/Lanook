from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, ContextManager, Iterable, Optional, Protocol, Tuple, runtime_checkable

from fs.base import FS


@dataclass
class ProviderCapability:
    """描述数据源 Provider 暴露给前端的能力信息。"""

    name: str
    display_name: str
    protocols: Tuple[str, ...] = tuple()
    requires_credentials: bool = False
    supports_anonymous: bool = False
    can_validate: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)
    credential_fields: list[dict[str, Any]] = field(default_factory=list)


@runtime_checkable
class FSProvider(Protocol):
    """统一的文件系统 provider 接口，便于扩展 SMB/WebDAV/S3 等源。"""

    name: str
    priority: int
    display_name: str
    protocols: Tuple[str, ...]
    requires_credentials: bool
    supports_anonymous: bool
    credential_fields: Tuple[dict[str, Any], ...]

    def can_handle(self, url: str) -> bool:
        ...

    def ro_fs(self, url: str) -> ContextManager[Tuple[FS, str]]:
        ...

    def read_bytes(self, url: str, max_bytes: Optional[int] = None) -> bytes:
        ...

    def iter_bytes(
        self,
        url: str,
        start: int = 0,
        length: Optional[int] = None,
        chunk_size: int = 1024 * 1024,
    ) -> Iterable[bytes]:
        ...

    def stat(self, url: str) -> Tuple[int, int]:
        ...

    # 以下能力可选实现
    def validate(self, payload: Any):  # noqa: ANN401 - 供各 Provider 自由定义
        ...

    def describe(self) -> ProviderCapability:
        ...

    def save_credentials(self, payload: dict[str, Any]) -> None:
        ...

    def clear_credentials(self, identifier: str) -> None:
        ...


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: list[FSProvider] = []

    def register(self, provider: FSProvider) -> None:
        replaced = False
        for idx, existing in enumerate(self._providers):
            if existing.name == provider.name:
                self._providers[idx] = provider
                replaced = True
                break
        if not replaced:
            self._providers.append(provider)
        self._providers.sort(key=lambda p: getattr(p, "priority", 0), reverse=True)

    def get(self, url: str) -> FSProvider:
        for provider in self._providers:
            try:
                if provider.can_handle(url):
                    return provider
            except Exception:
                continue
        raise ValueError(f"未找到可处理 {url} 的文件系统 Provider，请注册一个实现。")

    def get_by_name(self, name: str) -> FSProvider:
        for provider in self._providers:
            if provider.name == name:
                return provider
        raise LookupError(f"Provider {name} 未注册")

    def list(self) -> Tuple[FSProvider, ...]:
        return tuple(self._providers)


_registry = ProviderRegistry()


def register_provider(provider: FSProvider) -> None:
    _registry.register(provider)


def available_providers() -> list[str]:
    return [p.name for p in _registry.list()]


def get_provider(url: str) -> FSProvider:
    return _registry.get(url)


def get_provider_by_name(name: str) -> FSProvider:
    return _registry.get_by_name(name)


def list_provider_capabilities() -> list[dict[str, Any]]:
    capabilities: list[dict[str, Any]] = []
    for provider in _registry.list():
        describe_fn = getattr(provider, "describe", None)
        meta: Optional[dict[str, Any]] = None
        if callable(describe_fn):
            desc = describe_fn()
            if isinstance(desc, ProviderCapability):
                meta = asdict(desc)
            elif isinstance(desc, dict):
                meta = desc
        if meta is None:
            meta_obj = ProviderCapability(
                name=provider.name,
                display_name=getattr(provider, "display_name", provider.name),
                protocols=getattr(provider, "protocols", tuple()),
                requires_credentials=bool(getattr(provider, "requires_credentials", False)),
                supports_anonymous=bool(getattr(provider, "supports_anonymous", False)),
                can_validate=callable(getattr(provider, "validate", None)),
                credential_fields=list(getattr(provider, "credential_fields", tuple())),
            )
            meta = asdict(meta_obj)
        meta["credential_fields"] = list(
            meta.get("credential_fields") or getattr(provider, "credential_fields", tuple())
        )
        meta["metadata"] = meta.get("metadata", {})
        meta["protocols"] = [str(p) for p in (meta.get("protocols") or getattr(provider, "protocols", tuple()))]
        meta.setdefault("can_validate", callable(getattr(provider, "validate", None)))
        meta.setdefault("requires_credentials", bool(getattr(provider, "requires_credentials", False)))
        meta.setdefault("supports_anonymous", bool(getattr(provider, "supports_anonymous", False)))
        meta.setdefault("display_name", getattr(provider, "display_name", provider.name))
        meta.setdefault("name", provider.name)
        capabilities.append(meta)
    return capabilities


def ro_fs_for_url(url: str) -> ContextManager[Tuple[FS, str]]:
    provider = get_provider(url)
    return provider.ro_fs(url)


def read_bytes(url: str, max_bytes: Optional[int] = None) -> bytes:
    provider = get_provider(url)
    return provider.read_bytes(url, max_bytes)


def iter_bytes(
    url: str,
    start: int = 0,
    length: Optional[int] = None,
    chunk_size: int = 1024 * 1024,
):
    provider = get_provider(url)
    yield from provider.iter_bytes(url, start=start, length=length, chunk_size=chunk_size)


def stat_url(url: str) -> Tuple[int, int]:
    provider = get_provider(url)
    return provider.stat(url)


def save_provider_credentials(provider_name: str, payload: dict[str, Any]) -> None:
    try:
        provider = get_provider_by_name(provider_name)
    except LookupError:
        return
    handler = getattr(provider, "save_credentials", None)
    if callable(handler):
        handler(payload)


def clear_provider_credentials(provider_name: str, identifier: str) -> None:
    try:
        provider = get_provider_by_name(provider_name)
    except LookupError:
        return
    handler = getattr(provider, "clear_credentials", None)
    if callable(handler):
        handler(identifier)
