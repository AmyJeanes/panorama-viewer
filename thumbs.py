# /// script
# dependencies = ["numpy==2.4.6", "pillow==12.3.0"]
# ///
"""Draws each panorama's gallery thumbnail as its start view, from the base.jpg tiles.py wrote. Run it again after changing
a start view or heading.

    uv run thumbs.py <tour.json> ...      (or: pip install numpy pillow, then python thumbs.py ...)
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

QUALITY = 85
# The gallery shows 160x90; twice that for sharp screens
WIDTH, HEIGHT = 320, 180
# The viewer opens at a 90 degree vertical field of view
FOCAL = HEIGHT / 2 / math.tan(math.radians(90 / 2))


def thumb(base, yaw, pitch):
    w, h = base.size
    src = np.asarray(base)
    # Drawn at twice the size and scaled down, which smooths it
    xs, ys = np.meshgrid(np.arange(WIDTH * 2) + 0.5, np.arange(HEIGHT * 2) + 0.5)
    dx = (xs - WIDTH) / (FOCAL * 2)
    dy = (HEIGHT - ys) / (FOCAL * 2)
    # Each pixel's ray, from the view's forward, right and up directions; yaw turns right, pitch up
    sy, cy, sp, cp = math.sin(yaw), math.cos(yaw), math.sin(pitch), math.cos(pitch)
    x = sy * cp + dx * cy - dy * sy * sp
    y = sp + dy * cp
    z = cy * cp - dx * sy - dy * cy * sp
    lon = np.arctan2(x, z)
    lat = np.arctan2(y, np.hypot(x, z))
    col = ((lon / (2 * math.pi) + 0.5) * w).astype(int) % w
    row = np.clip(((0.5 - lat / math.pi) * h).astype(int), 0, h - 1)
    return Image.fromarray(src[row, col]).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main(*manifests):
    for manifest in map(Path, manifests):
        tour = json.loads(manifest.read_text(encoding='utf-8'))
        for p in tour['panoramas']:
            dir = manifest.parent / p['tiles']['dir']
            heading = p.get('heading', 0)
            view = p.get('startView', {})
            # Start views are in the tour's frame; the image's centre column faces its heading
            yaw = math.radians(view.get('yaw', heading) - heading)
            pitch = math.radians(view.get('pitch', 0))
            thumb(Image.open(dir / 'base.jpg').convert('RGB'), yaw, pitch).save(dir / 'thumb.jpg', quality=QUALITY)
        print(f'{manifest}: {len(tour["panoramas"])} thumbnails')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(*sys.argv[1:])
