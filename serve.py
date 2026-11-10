"""本地预览服务：支持 HTTP Range（大视频拖动）+ 封面写盘接口。

用法：python3 serve.py [端口] [--lan]
浏览器打开 http://localhost:8765/index.html
加 --lan 后监听所有网卡，同一 Wi-Fi 的手机可用终端里打印的局域网地址
打开作品集并播放视频（视频文件只在本机，不随页面上传到资料库）。
以 file:// 直接打开页面时，只要本服务在运行，页面也能 POST 到
http://localhost:8765/api/cover 把选中的画面写入 assets/thumbs/。
"""
import base64
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_PORT = os.environ.get("PORT", "").strip()
PORT = (int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit()
        else int(ENV_PORT) if ENV_PORT.isdigit() else 8765)
LAN_MODE = "--lan" in sys.argv
# 云端托管平台通过 PORT 注入端口，此时必须监听 0.0.0.0 且关闭写接口
PUBLIC_MODE = ENV_PORT.isdigit()
HOST = "0.0.0.0" if (LAN_MODE or PUBLIC_MODE) else "127.0.0.1"
THUMBS = os.path.join(ROOT, "assets", "thumbs")
VIDEOS = os.path.join(ROOT, "assets", "videos")
BACKUP = os.path.join(ROOT, "assets", "thumbs-before-custom")
VALID_IDS = {f"w{i:02d}" for i in range(1, 23)}


def ffmpeg_bin():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


def trim_letterbox(im):
    gray = im.convert("L")
    w, h = gray.size
    px = gray.load()
    step = max(1, w // 60)
    cols = list(range(0, w, step))
    top, bottom = 0, h
    for y in range(h):
        if sum(px[x, y] for x in cols) / len(cols) < 18:
            top = y + 1
        else:
            break
    for y in range(h - 1, -1, -1):
        if sum(px[x, y] for x in cols) / len(cols) < 18:
            bottom = y
        else:
            break
    return im.crop((0, top, w, bottom)) if bottom - top > h * 0.45 else im


def frame_from_video(wid, seconds):
    ff = ffmpeg_bin()
    if not ff:
        raise RuntimeError("本机未找到 ffmpeg，无法按时间点抽帧")
    src = os.path.join(VIDEOS, wid + ".mp4")
    if not os.path.isfile(src):
        raise RuntimeError(f"找不到视频 {wid}.mp4")
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, "frame.png")
        cmd = [ff, "-y", "-ss", f"{float(seconds):.2f}", "-i", src,
               "-frames:v", "1", "-vf", "scale=900:-1", raw]
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL,
                                stderr=subprocess.PIPE, timeout=90)
        if result.returncode != 0 or not os.path.isfile(raw):
            raise RuntimeError("抽帧失败：" + result.stderr.decode(errors="ignore")[-200:])
        from PIL import Image
        im = trim_letterbox(Image.open(raw).convert("RGB"))
        out = os.path.join(td, "cover.jpg")
        im.save(out, "JPEG", quality=90, optimize=True)
        with open(out, "rb") as f:
            return f.read()


def write_thumb(wid, binary):
    # 直接写入目标文件内容：不用 os.replace / 重命名覆盖，
    # 某些浏览预览环境会拒绝 rename overwrite 这类文件策略操作。
    os.makedirs(BACKUP, exist_ok=True)
    backup = os.path.join(BACKUP, wid + ".jpg")
    target = os.path.join(THUMBS, wid + ".jpg")
    if not os.path.isfile(backup) and os.path.isfile(target):
        with open(target, "rb") as src:
            original = src.read()
        with open(backup, "wb") as dst:
            dst.write(original)
    with open(target, "wb") as f:
        f.write(binary)
    return target


class _LimitedReader:
    def __init__(self, file, remaining):
        self.file = file
        self.remaining = remaining

    def read(self, size=-1):
        if self.remaining <= 0:
            return b""
        if size < 0 or size > self.remaining:
            size = self.remaining
        chunk = self.file.read(size)
        self.remaining -= len(chunk)
        return chunk

    def close(self):
        self.file.close()


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            file = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(file.fileno()).st_size
        ctype = self.guess_type(path)
        byte_range = self.headers.get("Range")

        if byte_range:
            match = re.match(r"bytes=(\d*)-(\d*)", byte_range)
            if match:
                start = int(match.group(1)) if match.group(1) else 0
                end = int(match.group(2)) if match.group(2) else size - 1
                if not match.group(1) and match.group(2):
                    start = max(0, size - int(match.group(2)))
                    end = size - 1
                end = min(end, size - 1)
                if start > end or start >= size:
                    file.close()
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return None
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Content-Length", str(end - start + 1))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                file.seek(start)
                return _LimitedReader(file, end - start + 1)

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return file

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle_order(self, payload):
        order = payload.get("order")
        if (not isinstance(order, list) or len(order) != len(VALID_IDS)
                or len(set(order)) != len(order) or set(order) != VALID_IDS):
            self._json({"ok": False, "error": "顺序列表不完整或有重复"}, 400)
            return
        data_path = os.path.join(ROOT, "assets", "data.js")
        try:
            with open(data_path, encoding="utf-8") as f:
                raw = f.read()
            prefix = raw[:raw.index("{")]
            data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
            by_id = {item["id"]: item for item in data["projects"]}
            if set(by_id) != VALID_IDS:
                raise ValueError("数据文件里的作品编号与预期不一致")
            for pos, wid in enumerate(order):
                by_id[wid]["order"] = pos
            # 直接覆盖写内容，不用 os.replace（文件策略会拒绝重命名覆盖）
            with open(data_path, "w", encoding="utf-8") as f:
                f.write(prefix + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")
            self._json({"ok": True, "saved": True, "count": len(order)})
        except Exception as exc:
            self._json({"ok": False, "error": str(exc)}, 500)

    def do_POST(self):
        # 线上只读：不允许访客改动封面或顺序
        if PUBLIC_MODE:
            self._json({"ok": False, "error": "online preview is read-only"}, 403)
            return
        path = self.path.split("?")[0]
        if path not in ("/api/cover", "/api/order"):
            self._json({"ok": False, "error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 12 * 1024 * 1024:
                raise ValueError("请求大小异常")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            self._json({"ok": False, "error": f"请求解析失败：{exc}"}, 400)
            return

        if path == "/api/order":
            self._handle_order(payload)
            return

        if payload.get("probe"):
            versions = {}
            for wid in sorted(VALID_IDS):
                cover = os.path.join(THUMBS, wid + ".jpg")
                if os.path.isfile(cover):
                    versions[wid] = int(os.path.getmtime(cover))
            self._json({"ok": True, "persist": True,
                        "ffmpeg": bool(ffmpeg_bin()), "versions": versions})
            return

        wid = str(payload.get("id") or "")
        if wid not in VALID_IDS:
            self._json({"ok": False, "error": "作品编号不合法"}, 400)
            return

        if payload.get("action") == "reset":
            backup = os.path.join(BACKUP, wid + ".jpg")
            target = os.path.join(THUMBS, wid + ".jpg")
            if not os.path.isfile(backup):
                self._json({"ok": False, "error": "没有可恢复的原始封面"})
                return
            with open(backup, "rb") as src:
                original = src.read()
            with open(target, "wb") as dst:
                dst.write(original)
            self._json({"ok": True, "restored": True, "id": wid})
            return

        try:
            data_url = payload.get("dataUrl")
            if data_url:
                match = re.match(r"data:image/(?:jpeg|jpg|png);base64,(.+)", data_url, re.S)
                if not match:
                    raise ValueError("图片格式不支持")
                binary = base64.b64decode(match.group(1))
                source = "浏览器画面"
            else:
                seconds = float(payload.get("time") or 0)
                binary = frame_from_video(wid, seconds)
                source = f"ffmpeg 抽帧 {seconds:.2f}s"
            if not binary or len(binary) > 10 * 1024 * 1024:
                raise ValueError("图片数据异常")
            target = write_thumb(wid, binary)
            self._json({"ok": True, "saved": True, "id": wid,
                        "path": os.path.relpath(target, ROOT),
                        "bytes": len(binary), "source": source})
        except Exception as exc:
            self._json({"ok": False, "error": str(exc)}, 500)

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def lan_address():
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # 不实际发包，只让系统选出通往外网的默认网卡地址
        sock.connect(("223.5.5.5", 80))
        return sock.getsockname()[0]
    except Exception:
        return socket.gethostbyname(socket.gethostname())
    finally:
        sock.close()


if __name__ == "__main__":
    os.chdir(ROOT)
    with Server((HOST, PORT), RangeHandler) as httpd:
        print(f"本地预览已启动：http://localhost:{PORT}/index.html", flush=True)
        if LAN_MODE:
            print(f"手机（需连同一 Wi-Fi）：http://{lan_address()}:{PORT}/index.html", flush=True)
        if not PUBLIC_MODE:
            print("封面保存接口：POST /api/cover", flush=True)
            print("顺序保存接口：POST /api/order", flush=True)
        else:
            print("线上只读模式：写接口已禁用，视频支持 HTTP Range", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
