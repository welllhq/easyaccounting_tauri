# -*- coding: utf-8 -*-
"""生成 Tauri 应用图标：蓝底圆角方块 + 白色上升柱状图（账本/资产寓意）"""
import os
from PIL import Image, ImageDraw

ICONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

BG = (24, 95, 165, 255)      # 主色蓝 #185FA5
BAR = (255, 255, 255, 255)   # 白色柱子
BAR_DARK = (224, 240, 255, 255)  # 高亮柱

def draw(size):
    """size: 边长（像素）。返回 RGBA 图像。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * 0.22
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)

    # 柱状图：5 根柱子，中间一根高亮
    u = size / 100.0
    bars = [
        (18, 52, 38, BAR),
        (34, 60, 30, BAR),
        (50, 30, 60, BAR_DARK),
        (66, 56, 34, BAR),
        (82, 46, 44, BAR),
    ]
    for x0, y0, w, color in bars:
        d.rounded_rectangle(
            [x0 * u, y0 * u, (x0 + w) * u, 78 * u],
            radius=5 * u, fill=color,
        )
    # 底部基线
    d.rounded_rectangle([14 * u, 76 * u, 86 * u, 82 * u], radius=3 * u, fill=(255, 255, 255, 235))
    return img

def main():
    # 各尺寸 PNG
    for s in (32, 128, 256, 512):
        draw(s).save(os.path.join(ICONS_DIR, f"{s}x{s}.png"))
    # Tauri 规范命名
    draw(32).save(os.path.join(ICONS_DIR, "32x32.png"))
    draw(128).save(os.path.join(ICONS_DIR, "128x128.png"))
    draw(256).save(os.path.join(ICONS_DIR, "128x128@2x.png"))
    draw(512).save(os.path.join(ICONS_DIR, "icon.png"))
    # ICO（含多尺寸）
    icon = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    icon.paste(draw(256), (0, 0))
    icon.save(os.path.join(ICONS_DIR, "icon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icons generated:", os.listdir(ICONS_DIR))

if __name__ == "__main__":
    main()
