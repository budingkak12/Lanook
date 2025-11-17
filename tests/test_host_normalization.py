from __future__ import annotations

from app.api.sources_routes import _normalize_host_input as normalize_api_host
from app.services.sources.smb_provider import _normalize_host_input as normalize_provider_host


def _assert_same(raw: str | None, expected: str) -> None:
    assert normalize_api_host(raw) == expected
    assert normalize_provider_host(raw) == expected


def test_normalize_host_basic():
    _assert_same('172.29.45.74', '172.29.45.74')
    _assert_same('172.29.45.74:445', '172.29.45.74')
    _assert_same("('172.29.45.74', None)", '172.29.45.74')
    _assert_same("'172.29.45.74'", '172.29.45.74')


def test_normalize_host_smb_and_paths():
    _assert_same('smb://172.29.45.74/Public', '172.29.45.74')
    _assert_same('SMB://NASBOX/Photos', 'nasbox')
    _assert_same('\\\\172.29.45.74\\Public', '172.29.45.74')
    _assert_same('//172.29.45.74/Public', '172.29.45.74')


def test_normalize_host_ipv6():
    _assert_same('[fe80::1]', 'fe80::1')
    _assert_same('[fe80::1]:445', 'fe80::1')
    _assert_same('smb://[fe80::1]/Public', 'fe80::1')


def test_normalize_host_empty_or_none():
    _assert_same(None, '')
    _assert_same('   ', '')
