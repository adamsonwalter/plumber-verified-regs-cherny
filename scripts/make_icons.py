#!/usr/bin/env python3
"""
Generate the app icon set into public/icons/.

Mark: an amber pipe elbow with flanges on the classic-mode navy. Drawn at 4x and
downsampled so the curves stay clean at 60 px on a Home Screen.

Icons are full-bleed squares with no transparency and no corner rounding of
their own: iOS applies its own squircle mask to apple-touch-icon, and a
pre-rounded source leaves black corners behind. The maskable variant keeps the
mark inside the 80% safe zone Android crops to.

Run: python3 scripts/make_icons.py
"""
from PIL import Image, ImageDraw

NAVY = (26, 26, 46)       # #1a1a2e — matches classic mode
AMBER = (232, 138, 48)    # sRGB rendering of the app's --amber
SS = 4                    # supersample factor

OUT = "public/icons"
SIZES = [
    ("icon-180.png", 180, 1.00),   # apple-touch-icon
    ("icon-192.png", 192, 1.00),
    ("icon-512.png", 512, 1.00),
    ("icon-512-maskable.png", 512, 0.80),  # mark shrunk into the safe zone
]


def draw_icon(size, scale):
    """Render one icon. `scale` shrinks the mark for maskable safe-zone padding."""
    S = size * SS
    img = Image.new("RGB", (S, S), NAVY)
    d = ImageDraw.Draw(img)

    def px(u, v):
        """Unit-square coords -> pixels, scaled about the centre."""
        return (S * (0.5 + (u - 0.5) * scale), S * (0.5 + (v - 0.5) * scale))

    stroke = int(S * 0.155 * scale)

    # Elbow: down the left, curve, out to the right.
    top, bend, right = (0.31, 0.20), (0.31, 0.69), (0.80, 0.69)
    d.line([px(*top), px(*bend), px(*right)],
           fill=AMBER, width=stroke, joint="curve")

    # Flanges: perpendicular collars capping each open end. These are wider than
    # the stroke, so they also hide the square ends Pillow's line() leaves —
    # hence no round caps, which would bulge past the collar.
    fl, fw = S * 0.130 * scale, S * 0.052 * scale
    tx, ty = px(*top)
    d.rounded_rectangle([tx - fl, ty - fw, tx + fl, ty + fw],
                        radius=fw * 0.5, fill=AMBER)
    rx, ry = px(*right)
    d.rounded_rectangle([rx - fw, ry - fl, rx + fw, ry + fl],
                        radius=fw * 0.5, fill=AMBER)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os
    os.makedirs(OUT, exist_ok=True)
    for name, size, scale in SIZES:
        path = os.path.join(OUT, name)
        draw_icon(size, scale).save(path, "PNG", optimize=True)
        print(f"wrote {path} ({size}x{size})")
