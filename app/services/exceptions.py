from __future__ import annotations


class ServiceError(Exception):
    """Base class that carries a default HTTP status code for API mapping."""

    default_status = 400

    def __init__(self, message: str = "", *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code if status_code is not None else self.default_status


class MediaNotFoundError(ServiceError):
    default_status = 404


class InvalidTagError(ServiceError):
    default_status = 400


class TagNotFoundError(ServiceError):
    default_status = 404


class TagAlreadyExistsError(ServiceError):
    default_status = 409


class SeedRequiredError(ServiceError):
    default_status = 400


class DatabaseReadOnlyError(ServiceError):
    default_status = 503


class FileNotFoundOnDiskError(ServiceError):
    default_status = 404


class ThumbnailUnavailableError(ServiceError):
    default_status = 404


class MetadataUnavailableError(ServiceError):
    default_status = 404


class InvalidRangeError(ServiceError):
    default_status = 416


class RangeNotSatisfiableError(ServiceError):
    default_status = 416
