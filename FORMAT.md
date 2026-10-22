# Tour format

A library is a folder whose `library.json` lists its tours. A tour is a JSON manifest of one or more 360 panoramas, each cut into tiles by `tiles.py`.

```
<library>/
  library.json
  <source>/
    <tour>.json
    tiles/<image>/        base.jpg, thumb.jpg and <level>/<col>_<row>.jpg
```

## library.json

```json
{
  "name": "Example house",
  "tours": [{ "name": "Main hall", "path": "example/main-hall.json" }]
}
```

`name` is the page title and labels the folder among recent ones. Tour paths are relative to the library folder.

## Tour manifest

```json
{
  "title": "Main hall",
  "description": "...",
  "credits": [{ "role": "Photography", "name": "..." }],
  "copyright": "© ...",
  "source": { "name": "...", "url": "https://...", "archived": "2026-01-01" },
  "start": "entrance",
  "panoramas": [
    {
      "id": "entrance",
      "title": "Entrance",
      "heading": 0,
      "startView": { "yaw": 77.8, "pitch": -9 },
      "links": [{ "to": "stairs", "yaw": 159.7, "pitch": 0 }],
      "width": 13312, "height": 6656,
      "tiles": { "dir": "tiles/entrance", "levels": [{ "width": 3328, "cols": 4, "rows": 2 }, { "width": 13312, "cols": 16, "rows": 8 }] }
    }
  ]
}
```

- Only `title` and the panoramas' `id` and `tiles` are required. Other fields are ignored, so an archive can keep its own metadata.
- Angles are degrees: yaw clockwise in [-180, 180), pitch positive up.
- `heading` is the bearing of the image's centre column, [0, 360), in one frame for the whole tour (true north, or matched by eye). Link and start yaws are in that frame too, so walking keeps your direction.
- Each link is drawn as an arrow. `startView` defaults to facing the heading.
- `id`s use only letters, digits, `_`, `.` and `-`. `start` defaults to the first panorama.
- `partial: true` shows an "Incomplete Panorama" badge; a string shows that label instead.
- `title`, `description`, `credits`, `copyright` and `source` fill the details panel.
- `tiles` is written by `tiles.py`: `dir` relative to the manifest, levels coarsest first.
