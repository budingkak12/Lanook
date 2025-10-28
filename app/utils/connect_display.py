from __future__ import annotations

import base64
import json
import os
import socket
import threading
import time
import webbrowser
from dataclasses import dataclass
from io import BytesIO
from typing import List, Optional, Sequence, Set


def _iter_local_ipv4() -> Set[str]:
    """枚举当前主机的局域网 IPv4 地址（排除回环）。"""
    addrs: Set[str] = set()

    # 1) 通过 UDP “假连接”探测默认出口
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.connect(("8.8.8.8", 80))
            addrs.add(sock.getsockname()[0])
        finally:
            sock.close()
    except Exception:
        pass

    # 2) 主机名解析
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None):
            family, _, _, _, sockaddr = info
            if family == socket.AF_INET:
                ip = sockaddr[0]
                if not ip.startswith("127."):
                    addrs.add(ip)
    except Exception:
        pass

    # 3) 回退：若只得到回环，至少返回 127.0.0.1
    if not addrs:
        addrs.add("127.0.0.1")
    return addrs


def _normalize_port(port: Optional[int]) -> int:
    try:
        if port is None:
            raise ValueError
        value = int(port)
        if 1 <= value <= 65535:
            return value
    except Exception:
        pass
    return 8000


@dataclass(slots=True)
class ConnectionAdvert:
    base_urls: List[str]
    lan_ips: List[str]
    port: int
    ascii_qr: Optional[str]
    qr_data_uri: Optional[str]
    payload: str


def _generate_qr_assets(data: str) -> tuple[Optional[str], Optional[str]]:
    """尝试使用 qrcode 库生成 ASCII 与 PNG Data URI；若未安装则返回 (None, None)。"""
    try:
        import qrcode

        qr = qrcode.QRCode(version=None, box_size=1, border=1)
        qr.add_data(data)
        qr.make(fit=True)
        matrix = qr.get_matrix()
        dark = "██"
        light = "  "
        lines = ["".join(dark if col else light for col in row) for row in matrix]
        ascii_art = "\n".join(lines)

        img = qr.make_image(fill_color="black", back_color="white")
        try:
            img = img.convert("RGB")
        except Exception:
            pass
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        data_uri = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        return ascii_art, data_uri
    except Exception:
        return None, None


def prepare_advertised_endpoints(
    preferred_port: Optional[int] = None,
    extra_hosts: Optional[Sequence[str]] = None,
) -> ConnectionAdvert:
    """生成二维码所需的地址列表与可选 ASCII 渲染。"""
    port = _normalize_port(preferred_port)
    local_ips = sorted(_iter_local_ipv4())

    hosts: List[str] = []
    for ip in local_ips:
        hosts.append(f"http://{ip}:{port}")
    hosts.append(f"http://localhost:{port}")
    hosts.append(f"http://127.0.0.1:{port}")

    if extra_hosts:
        for host in extra_hosts:
            if host not in hosts:
                hosts.insert(0, host)

    # 去重同时保持顺序
    seen: Set[str] = set()
    base_urls = []
    for url in hosts:
        if url not in seen:
            base_urls.append(url)
            seen.add(url)

    payload = base_urls[0]
    ascii_qr, data_uri = _generate_qr_assets(payload)
    return ConnectionAdvert(
        base_urls=base_urls,
        lan_ips=local_ips,
        port=port,
        ascii_qr=ascii_qr,
        qr_data_uri=data_uri,
        payload=payload,
    )


CONNECT_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8"/>
    <title>Media App 连接信息</title>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <style>
      body {{ font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
      .card {{ background: rgba(15,23,42,0.85); border-radius: 16px; padding: 28px; max-width: 560px; margin: 0 auto; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.45); }}
      h1 {{ font-size: 24px; margin: 0 0 16px; font-weight: 600; }}
      p {{ line-height: 1.6; margin: 0 0 12px; color: #cbd5f5; }}
      ul {{ padding-left: 18px; margin: 12px 0 24px; }}
      li {{ margin-bottom: 6px; }}
      .qr {{ display: flex; justify-content: center; margin: 24px 0; position: relative; }}
      .qr canvas, .qr img {{ width: 240px; height: 240px; border-radius: 16px; background: #e2e8f0; padding: 12px; box-sizing: border-box; }}
      .qr img {{ image-rendering: pixelated; }}
      .qr-placeholder {{ display: flex; align-items: center; justify-content: center; width: 240px; height: 240px; border-radius: 16px; background: rgba(148, 163, 184, 0.15); color: #cbd5f5; text-align: center; padding: 16px; }}
      .url-input {{ display: flex; }}
      .url-input input {{ width: 100%; padding: 10px 14px; border-radius: 8px; border: none; background: #1e293b; color: #e0f2fe; font-size: 14px; }}
      .muted {{ color: #94a3b8; font-size: 14px; }}
      footer {{ text-align: center; margin-top: 28px; color: #64748b; font-size: 13px; }}
    </style>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  </head>
  <body>
    <div class="card">
      <h1>连接到 Media App</h1>
      <p>请确保手机与服务器处于同一局域网，对准下方二维码即可让 App 自动获取地址。</p>
      <p>你也可以手动输入如下 IP 地址：</p>
      <div class="qr">
        <div id="qrPlaceholder" class="qr-placeholder" style="display:{placeholderDisplay};">
          {placeholderText}
        </div>
        <img id="qrImg" src="{qrDataUri}" alt="连接二维码" style="display:{imgDisplay};"/>
        <canvas id="qrCanvas" style="display:{canvasDisplay};"></canvas>
      </div>
      <div class="url-input">
        <input id="baseInput" type="text" value="{primaryUrl}" spellcheck="false" readonly/>
      </div>
      <footer>首次启动 Android App，点击“扫码”后对准此二维码即可自动填充。</footer>
    </div>
    <script>
      function hasQrLib() {{
        return typeof QRCode !== "undefined";
      }}
      function drawQr(text) {{
        if (!hasQrLib()) {{ return; }}
        const opts = {{ width: 240, margin: 1, color: {{ dark: "#0f172a", light: "#f8fafc" }} }};
        const img = document.getElementById("qrImg");
        const canvas = document.getElementById("qrCanvas");
        const placeholder = document.getElementById("qrPlaceholder");
        QRCode.toDataURL(text, opts, function (error, url) {{
          if (error) {{
            console.error(error);
            return;
          }}
          if (img) {{
            img.src = url;
            img.style.display = "block";
          }}
          if (canvas) {{
            canvas.style.display = "none";
          }}
          if (placeholder) {{
            placeholder.style.display = "none";
          }}
        }});
      }}
      document.addEventListener("DOMContentLoaded", () => {{
        if (hasQrLib()) {{
          drawQr("{jsPrimary}");
        }} else {{
          const placeholder = document.getElementById("qrPlaceholder");
          if (placeholder && !"{qrDataUri}".length) {{
            placeholder.style.display = "flex";
          }}
        }}
      }});
    </script>
  </body>
</html>
"""


def render_connect_page(advert: ConnectionAdvert, preferred: Optional[str] = None) -> str:
    urls = list(advert.base_urls)
    if preferred and preferred not in urls:
        urls.insert(0, preferred)
    primary = urls[0]
    qr_data = advert.qr_data_uri or ""
    img_display = "block" if qr_data else "none"
    canvas_display = "none" if qr_data else "block"
    placeholder_display = "none" if qr_data else "flex"
    placeholder_text = (
        "二维码未生成，请确认服务器已安装 qrcode[pil] 或直接手动输入地址。"
    )
    return CONNECT_PAGE_TEMPLATE.format(
        primaryUrl=primary,
        jsPrimary=primary.replace('"', '\\"'),
        qrDataUri=qr_data,
        imgDisplay=img_display,
        canvasDisplay=canvas_display,
        placeholderDisplay=placeholder_display,
        placeholderText=placeholder_text,
    )


def schedule_browser_open(url: str, delay: float = 1.5) -> None:
    """延迟打开默认浏览器访问指定 URL。"""
    def _task():
        time.sleep(max(delay, 0))
        try:
            webbrowser.open(url, new=1)
        except Exception:
            pass

    threading.Thread(target=_task, daemon=True).start()


def ascii_banner(advert: ConnectionAdvert) -> str:
    """返回启动时用于终端展示的信息文本。"""
    line = "=" * 56
    urls = "\n".join(f"  - {url}" for url in advert.base_urls[:5])
    extra = ""
    if len(advert.base_urls) > 5:
        extra = f"\n  (+{len(advert.base_urls) - 5} 个更多地址)"
    qr = advert.ascii_qr or "（安装 `pip install qrcode[pil]` 可显示终端二维码）"
    return (
        f"{line}\nMedia App 已准备就绪。\n"
        f"建议在手机中使用以下任一地址：\n{urls}{extra}\n\n"
        f"二维码：\n{qr}\n{line}"
    )
