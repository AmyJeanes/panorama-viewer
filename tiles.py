# /// script
# dependencies = ["pillow==12.3.0"]
# ///
"""Cuts an original 2:1 equirectangular image into the viewer's tiles and prints the panorama's manifest fields.

    uv run tiles.py <image.jpg> [<tour folder>]      (or: pip install pillow, then python tiles.py ...)

The tiles go to tiles/<image name>/ in the folder that holds the tour's manifest, by default the current one (FORMAT.md).
"""
import json
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # panoramas are legitimately huge
QUALITY = 85
MAX_TILE = 1024  # a quarter of the files 512 px tiles need, for up to about 75% more texture memory zoomed in
BASE = 2048


def main(image, folder='.'):
    image = Path(image)
    out = Path(folder) / 'tiles' / image.stem
    img = Image.open(image)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    w, h = img.size
    if w != 2 * h:
        sys.exit(f'{image} is {w}x{h}; equirectangular panoramas must be exactly 2:1')

    out.mkdir(parents=True, exist_ok=True)
    base = min(w, BASE)
    img.resize((base, base // 2), Image.Resampling.LANCZOS).save(out / 'base.jpg', quality=QUALITY)
    img.resize((320, 160), Image.Resampling.LANCZOS).save(out / 'thumb.jpg', quality=QUALITY)

    # Columns at full width: tiles of at most MAX_TILE px, as a power of two up to 64, which Photo Sphere Viewer needs
    top = 4
    while w / top > MAX_TILE and top < 64:
        top *= 2
    levels = []
    # Quarter, half and full width; a level no wider than base.jpg can't look sharper than it, so it's skipped
    for k in (k for k in (2, 1, 0) if k == 0 or w / 2 ** k > base):
        cols = top >> k
        # Square tiles, so the level's width rounds to whole tiles
        tile = round(w / 2 ** k / cols)
        level = img if cols * tile == w else img.resize((cols * tile, cols * tile // 2), Image.Resampling.LANCZOS)
        (out / str(len(levels))).mkdir(exist_ok=True)
        for col in range(cols):
            for row in range(cols // 2):
                level.crop((col * tile, row * tile, (col + 1) * tile, (row + 1) * tile)).save(out / str(len(levels)) / f'{col}_{row}.jpg', quality=QUALITY)
        levels.append({'width': cols * tile, 'cols': cols, 'rows': cols // 2})

    print(json.dumps({'width': w, 'height': h, 'tiles': {'dir': f'tiles/{image.stem}', 'levels': levels}}, indent=2))


if __name__ == '__main__':
    if not 2 <= len(sys.argv) <= 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
