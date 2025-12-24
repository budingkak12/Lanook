import { resolveApiUrl, type AssetPipelineStatus, type ScanTaskStatus } from "@/lib/api"

export type TasksSnapshot = {
  scan: ScanTaskStatus
  asset: AssetPipelineStatus
}

export function subscribeTasksSnapshot(
  onSnapshot: (snapshot: TasksSnapshot) => void,
  onError?: (err: unknown) => void,
): () => void {
  const url = resolveApiUrl("/events/tasks")
  const es = new EventSource(url)

  const handler = (evt: Event) => {
    try {
      const msg = evt as MessageEvent
      const data = JSON.parse(msg.data) as TasksSnapshot
      if (data?.scan && data?.asset) {
        onSnapshot(data)
      }
    } catch (err) {
      onError?.(err)
    }
  }

  es.addEventListener("snapshot", handler)
  es.onerror = (evt) => {
    onError?.(evt)
  }

  return () => {
    try {
      es.removeEventListener("snapshot", handler)
      es.close()
    } catch {
      /* noop */
    }
  }
}

