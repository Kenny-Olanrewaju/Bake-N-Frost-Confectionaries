"""
Bake N Frost - image optimizer (run ONCE on your computer, before uploading to Render)

What it does
  * Shrinks every photo in the "images" folder to at most 1600 px on the long side
    and saves it as a normal .jpg (quality 82). Phone/AI photos are often 2-6 MB;
    after this they are usually 100-300 KB, so the site loads several times faster.
  * Turns every ".jfif" into ".jpg" (browsers, WhatsApp and social previews all
    handle .jpg reliably; .jfif is the odd one out).
  * Updates the picture names inside index.html for you.
  * Keeps your originals safe in a new folder called  images-original.

How to run (Windows / Mac)
  1. Install Python from python.org (tick "Add to PATH"), then in a terminal:  pip install pillow
  2. Put this file in the same folder as index.html and the images folder.
  3. In that folder run:  python optimize-images.py
  4. Open the site locally, check the pictures, then upload to Render.
"""
import os, re, shutil, sys
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(HERE, "images")
BACKUP = os.path.join(HERE, "images-original")
HTML = os.path.join(HERE, "index.html")
MAX_SIDE = 1600
QUALITY = 82
EXTS = {".jfif", ".jpg", ".jpeg", ".png", ".webp"}

if not os.path.isdir(IMG_DIR):
    sys.exit("Cannot find the 'images' folder next to this script.")
if not os.path.isdir(BACKUP):
    shutil.copytree(IMG_DIR, BACKUP)
    print("Backup saved to images-original")

renames = {}
before = after = 0
for name in sorted(os.listdir(IMG_DIR)):
    stem, ext = os.path.splitext(name)
    if ext.lower() not in EXTS:
        continue
    path = os.path.join(IMG_DIR, name)
    size = os.path.getsize(path)
    try:
        im = ImageOps.exif_transpose(Image.open(path))
    except Exception as e:
        print("skipped (not a readable image):", name, e)
        continue
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    if ext.lower() == ".png" and has_alpha:
        out_name = name                               # keep transparent PNGs (logos) as PNG
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        im.save(path, "PNG", optimize=True)
    else:
        out_name = stem + ".jpg"
        im = im.convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        out_path = os.path.join(IMG_DIR, out_name)
        im.save(out_path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        if out_name != name:
            os.remove(path)
            renames[name] = out_name
        path = out_path
    before += size
    after += os.path.getsize(path)
    print(f"{name:55s} {size/1024:8.0f} KB -> {os.path.getsize(path)/1024:6.0f} KB")

if renames and os.path.isfile(HTML):
    html = open(HTML, encoding="utf-8").read()
    n = 0
    for old, new in renames.items():
        for variant_old, variant_new in ((old, new), (old.replace(" ", "%20"), new.replace(" ", "%20"))):
            n += html.count("images/" + variant_old)
            html = html.replace("images/" + variant_old, "images/" + variant_new)
    open(HTML, "w", encoding="utf-8").write(html)
    print(f"Updated {n} picture names in index.html")

print(f"\nTotal: {before/1024/1024:.1f} MB -> {after/1024/1024:.1f} MB")
