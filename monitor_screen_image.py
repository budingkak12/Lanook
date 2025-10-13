"""Monitor a target application state on Windows using template matching and send toast alerts on completion."""
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

try:
    import cv2  # type: ignore
    import numpy as np
except ImportError:  # noqa: F401
    cv2 = None  # type: ignore
    np = None  # type: ignore

import pyautogui
from PIL import Image, ImageChops, ImageStat
from win10toast import ToastNotifier

pyautogui.FAILSAFE = False
if hasattr(pyautogui, "useImageNotFoundException"):
    pyautogui.useImageNotFoundException()


@dataclass
class Region:
    left: int
    top: int
    width: int
    height: int

    @property
    def tuple(self) -> Tuple[int, int, int, int]:
        return (self.left, self.top, self.width, self.height)


@dataclass
class StateTemplate:
    label: str
    path: Path
    pil_image: Image.Image
    cv_gray: Optional[np.ndarray]

    @classmethod
    def load(cls, label: str, path: Path) -> "StateTemplate":
        pil_image = Image.open(path).convert("RGB")
        cv_gray = None
        if cv2 is not None and np is not None:
            cv_gray = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2GRAY)
        return cls(label=label.lower(), path=path, pil_image=pil_image, cv_gray=cv_gray)


class StateDetector:
    def __init__(self, templates: Iterable[StateTemplate], match_threshold: float) -> None:
        self.templates = list(templates)
        self.match_threshold = match_threshold

    def evaluate(self, screenshot: Image.Image) -> Tuple[Optional[StateTemplate], float]:
        best_template: Optional[StateTemplate] = None
        best_score = 0.0
        for template in self.templates:
            score = self._similarity(screenshot, template)
            if score > best_score:
                best_score = score
                best_template = template
        if best_score < self.match_threshold:
            return None, best_score
        return best_template, best_score

    def _similarity(self, screenshot: Image.Image, template: StateTemplate) -> float:
        if cv2 is not None and np is not None and template.cv_gray is not None:
            region_gray = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2GRAY)
            if region_gray.shape != template.cv_gray.shape:
                resized = cv2.resize(template.cv_gray, (region_gray.shape[1], region_gray.shape[0]))
                result = cv2.matchTemplate(region_gray, resized, cv2.TM_CCOEFF_NORMED)
            else:
                result = cv2.matchTemplate(region_gray, template.cv_gray, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, _ = cv2.minMaxLoc(result)
            return float(max_val)
        if screenshot.size != template.pil_image.size:
            resized_template = template.pil_image.resize(screenshot.size)
        else:
            resized_template = template.pil_image
        difference = ImageChops.difference(resized_template, screenshot)
        stat = ImageStat.Stat(difference)
        mean_diff = sum(stat.mean) / len(stat.mean)
        score = 1.0 - (mean_diff / 255.0)
        return float(max(0.0, min(1.0, score)))


class StateMonitor:
    def __init__(
        self,
        region: Region,
        detector: StateDetector,
        notifier: ToastNotifier,
        check_interval: float,
        cooldown: float,
        stabilize_rounds: int,
        notify_on_states: Iterable[str],
        notify_on_first: bool,
    ) -> None:
        self.region = region
        self.detector = detector
        self.notifier = notifier
        self.check_interval = check_interval
        self.cooldown = cooldown
        self.stabilize_rounds = max(1, stabilize_rounds)
        self.notify_on = {state.lower() for state in notify_on_states}
        self.notify_on_first = notify_on_first

        self._last_state: Optional[str] = None
        self._last_notification_at: float = 0.0
        self._hit_counters: Dict[str, int] = {}

    def _capture(self) -> Image.Image:
        return pyautogui.screenshot(region=self.region.tuple).convert("RGB")

    def _notify(self, message: str) -> None:
        now = time.monotonic()
        if now - self._last_notification_at >= self.cooldown:
            self.notifier.show_toast("任务状态监控", message, duration=5, threaded=True)
            self._last_notification_at = now

    def watch(self) -> None:
        print(
            f"监控区域 left={self.region.left}, top={self.region.top}, "
            f"width={self.region.width}, height={self.region.height}"
        )
        print("按 Ctrl+C 停止监控")
        try:
            while True:
                screenshot = self._capture()
                template, score = self.detector.evaluate(screenshot)
                if template is None:
                    self._hit_counters.clear()
                else:
                    label = template.label
                    current_hits = self._hit_counters.get(label, 0) + 1
                    self._hit_counters[label] = current_hits
                    for other in list(self._hit_counters):
                        if other != label:
                            self._hit_counters.pop(other, None)
                    if current_hits >= self.stabilize_rounds:
                        if self._last_state != label:
                            previous = self._last_state
                            self._last_state = label
                            should_notify = False
                            if label in self.notify_on:
                                if previous is None and self.notify_on_first:
                                    should_notify = True
                                elif previous is not None and previous != label:
                                    should_notify = True
                            if should_notify:
                                self._notify(f"状态切换为 {label} (匹配度 {score:.2f})")
                time.sleep(self.check_interval)
        except KeyboardInterrupt:
            print("已停止监控")


def parse_region(value: str) -> Region:
    parts = value.split(",")
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("region 需要格式 left,top,width,height")
    try:
        left, top, width, height = (int(p.strip()) for p in parts)
    except ValueError as exc:  # noqa: TRY002
        raise argparse.ArgumentTypeError("region 参数必须是整数") from exc
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("width 和 height 必须大于 0")
    return Region(left=left, top=top, width=width, height=height)


def locate_region(templates: Iterable[StateTemplate], confidence: float) -> Optional[Region]:
    best_region: Optional[Region] = None
    best_confidence = -1.0
    for template in templates:
        current_conf = confidence
        while current_conf >= 0.3:
            locate_args = {"confidence": current_conf, "grayscale": True}
            try:
                location = pyautogui.locateOnScreen(str(template.path), **locate_args)
            except Exception:
                location = None
            if location is not None:
                if current_conf > best_confidence:
                    best_confidence = current_conf
                    best_region = Region(
                        left=int(location.left),
                        top=int(location.top),
                        width=int(location.width),
                        height=int(location.height),
                    )
                break
            current_conf -= 0.1
    return best_region


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="根据运行中/完成状态截图监控任务，状态变化时发送 Windows 提醒"
    )
    parser.add_argument("running", type=Path, help="运行中状态截图路径")
    parser.add_argument("completed", type=Path, help="完成状态截图路径")
    parser.add_argument(
        "--region",
        type=parse_region,
        help="直接指定监控区域，格式 left,top,width,height (像素)",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.8,
        help="模板定位初始置信度，自动递减至 0.3",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.7,
        help="状态识别匹配阈值 (0-1)，越高越严格",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="检测间隔秒数",
    )
    parser.add_argument(
        "--cooldown",
        type=float,
        default=10.0,
        help="通知节流秒数，避免频繁弹窗",
    )
    parser.add_argument(
        "--stabilize",
        type=int,
        default=2,
        help="确认状态前连续命中次数，可减少抖动",
    )
    parser.add_argument(
        "--notify-first",
        action="store_true",
        help="脚本启动后首次识别到有效状态也提醒（默认只在状态变化时提醒）",
    )
    parser.add_argument(
        "--notify-on",
        type=str,
        nargs="*",
        default=["completed"],
        help="需要提醒的状态标签列表，默认只提醒 completed",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    running_path = args.running.expanduser().resolve()
    completed_path = args.completed.expanduser().resolve()
    for path in (running_path, completed_path):
        if not path.exists():
            print(f"模板文件 {path} 不存在", file=sys.stderr)
            sys.exit(1)

    running_template = StateTemplate.load("running", running_path)
    completed_template = StateTemplate.load("completed", completed_path)

    region = args.region
    if region is None:
        region = locate_region([running_template, completed_template], args.confidence)
        if region is None:
            print(
                "无法自动定位窗口区域，请确保其中一个状态当前可见，或使用 --region 指定", file=sys.stderr
            )
            sys.exit(2)

    detector = StateDetector([running_template, completed_template], match_threshold=args.threshold)
    notifier = ToastNotifier()

    monitor = StateMonitor(
        region=region,
        detector=detector,
        notifier=notifier,
        check_interval=args.interval,
        cooldown=args.cooldown,
        stabilize_rounds=args.stabilize,
        notify_on_states=args.notify_on,
        notify_on_first=args.notify_first,
    )

    monitor.watch()


if __name__ == "__main__":
    main()
