from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class DirectoryEntryModel(BaseModel):
    path: str = Field(..., description="目录的绝对路径")
    name: str = Field(..., description="目录显示名称")
    readable: bool = Field(..., description="是否具有读取权限")
    writable: bool = Field(..., description="是否具有写入权限")
    is_root: bool = Field(..., description="是否为顶级根目录")
    is_symlink: bool = Field(False, description="是否为符号链接")


class DirectoryListResponse(BaseModel):
    current_path: str
    parent_path: Optional[str] = None
    entries: List[DirectoryEntryModel]


class InitializationStateModel(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class MediaRootRequest(BaseModel):
    # 允许省略 path 以简化调用：服务端将自动选择已存在的第一个媒体来源
    path: Optional[str] = None


class InitializationStatusResponse(BaseModel):
    state: InitializationStateModel
    message: Optional[str] = None
    media_root_path: Optional[str] = None


# ===== 新增：常用目录与权限/系统信息 =====

class CommonFolderCategory(str, Enum):
    DESKTOP = "desktop"
    DOCUMENTS = "documents"
    DOWNLOADS = "downloads"
    PICTURES = "pictures"
    VIDEOS = "videos"
    MUSIC = "music"
    HOME = "home"
    VOLUME = "volume"


class CommonFolderEntryModel(DirectoryEntryModel):
    category: CommonFolderCategory


class OSInfoResponse(BaseModel):
    os: str
    lan_ips: List[str]
    port: int


class ProbeRequest(BaseModel):
    paths: List[str]


class ProbeStatus(str, Enum):
    OK = "ok"
    DENIED = "denied"
    NOT_FOUND = "not_found"
    ERROR = "error"


class ProbeResultModel(BaseModel):
    path: str
    status: ProbeStatus
    reason: Optional[str] = None
