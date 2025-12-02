from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class UploadErrorCode(str, Enum):
    """标准化的上传错误码，便于前后端对齐。"""

    UPLOAD_NOT_FOUND = "upload_not_found"
    CHUNK_OUT_OF_RANGE = "chunk_out_of_range"
    DUPLICATE_FINISH = "duplicate_finish"
    INVALID_CHECKSUM = "invalid_checksum"
    SIZE_MISMATCH = "size_mismatch"


class InitUploadRequest(BaseModel):
    """客户端发起上传时的请求参数。"""

    filename: str
    total_size: int = Field(gt=0, description="文件总大小（字节）")
    chunk_size: int = Field(gt=0, description="分块大小（字节）")
    checksum: Optional[str] = Field(default=None, description="全文件哈希，用于秒传/校验，可选")
    device_id: Optional[str] = Field(default=None, description="设备唯一标识，用于归档路径")
    mime_type: Optional[str] = Field(default=None, description="MIME 类型提示")
    relative_path: Optional[str] = Field(default=None, description="相对根目录的子路径，保持原目录结构")
    modified_at: Optional[int] = Field(default=None, description="客户端文件修改时间戳（毫秒）")


class InitUploadResponse(BaseModel):
    """服务端返回的上传会话信息。"""

    upload_id: str
    existed: bool = Field(default=False, description="若为秒传则为 True")
    received_chunks: List[int] = Field(default_factory=list, description="已接收的分块序号列表（0 基）")
    chunk_size: int


class ChunkRequest(BaseModel):
    """上传单个分块时附带的元信息。"""

    upload_id: str
    index: int = Field(ge=0, description="分块序号，0 基")
    checksum: Optional[str] = Field(default=None, description="该分块哈希，可选")


class ChunkStatusResponse(BaseModel):
    """查询已上传分块列表的响应。"""

    upload_id: str
    received_chunks: List[int] = Field(default_factory=list)
    total_size: Optional[int] = None
    chunk_size: Optional[int] = None


class FinishRequest(BaseModel):
    """通知服务端合并分块并触发后续流程。"""

    upload_id: str
    total_chunks: int = Field(gt=0, description="预期分块总数")
    checksum: Optional[str] = Field(default=None, description="全文件哈希再次校验")
    skip_scan: bool = Field(default=False, description="可选：仅写入磁盘不触发扫描")
