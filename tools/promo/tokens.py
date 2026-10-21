#!/usr/bin/env python3
"""從本機安裝的 DSH app.asar 抽出官方 token CSS（渲染宣傳片需要）。

用法：python3 tools/promo/tokens.py            # 產生 tools/promo/tokens.css
     DSH_ASAR=/path/to/app.asar python3 ...
"""
import json, os, re, struct, sys

ASAR = os.environ.get("DSH_ASAR", "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar")
THEME = "dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js"


def read_from_asar(path: str, target: str) -> str:
    with open(path, "rb") as f:
        head = f.read(16)
        _, header_size, _, _ = struct.unpack("<IIII", head)
        f.seek(16)
        size = struct.unpack("<I", f.read(4))[0]
        f.seek(16)
        header = json.loads(f.read(size).decode("utf-8"))
        node = header
        for part in target.split("/"):
            node = node["files"][part]
        base = 8 + header_size
        f.seek(base + int(node["offset"]))
        return f.read(int(node["size"])).decode("utf-8")


def main() -> int:
    src = read_from_asar(ASAR, THEME)
    sel = re.compile(r"(:root|body,body \*|body(?:\[[^\]]*\])*|html\[data-platform=[^\]]*\] body(?:\[[^\]]*\])*)\{")
    merged, order = {}, []
    for m in sel.finditer(src):
        name = m.group(1)
        end = src.find("}", m.end())
        if end < 0:
            continue
        body = src[m.end():end]
        if "--dsw-" not in body and "--dsh-" not in body:
            continue
        merged.setdefault(name, {})
        if name not in order:
            order.append(name)
        for token, value in re.findall(r"(--[\w-]+):([^;]+);", body + ";"):
            merged[name][token] = value.strip()
    out = "\n".join(s + "{" + "".join(f"{k}:{v};" for k, v in merged[s].items()) + "}" for s in order)
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "tokens.css"), "w", encoding="utf-8") as f:
        f.write(out)
    print(f"tokens.css: {len(merged)} selectors, {len(out)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
