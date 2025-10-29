from fastapi import APIRouter, Query

from app.schemas.tasks import ScanTaskStateModel, ScanTaskStatusResponse
from app.services.task_progress import ScanTaskState, compute_scan_task_progress

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/scan-progress", response_model=ScanTaskStatusResponse)
def get_scan_progress(force_refresh: bool = Query(False, description="是否强制刷新目录统计缓存")):
    progress = compute_scan_task_progress(force_refresh_directory=force_refresh)
    return ScanTaskStatusResponse(
        state=ScanTaskStateModel(progress.state.value),
        media_root_path=str(progress.media_root_path) if progress.media_root_path else None,
        scanned_count=progress.scanned_count,
        total_discovered=progress.total_discovered,
        remaining_count=progress.remaining_count,
        preview_batch_size=progress.preview_batch_size,
        message=progress.message,
        generated_at=progress.generated_at,
    )
