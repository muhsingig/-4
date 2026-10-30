"""Widen a portrait cutout whose jacket touches the left/right/bottom edges: mirror the
fleece outward and downward and continue the shoulder line's slope, so the shoulders run off
the edges of the hero instead of ending in a straight vertical cut.
Usage: python -I extend_sides.py <cutout.png> <out.png> [pad_fraction=0.3]"""
import sys
import cv2
import numpy as np

src, dst = sys.argv[1:3]
frac = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
im = cv2.imread(src, cv2.IMREAD_UNCHANGED)
h, w = im.shape[:2]
pad = int(w * frac)
a = im[:, :, 3] > 128

# also mirror the jacket downward so the 3D torso never shows its bottom edge
out = cv2.copyMakeBorder(im, 0, int(h * 0.2), pad, pad, cv2.BORDER_REFLECT_101)
W = out.shape[1]
alpha = out[:, :, 3].astype(np.float32)


def shoulder_top(xs):
    """Topmost opaque row for each column (h when the column is empty)."""
    return np.array([np.argmax(a[:, x]) if a[:, x].any() else h for x in xs], np.float32)


for side in (0, 1):
    xs = np.arange(0, 120) if side == 0 else np.arange(w - 120, w)
    tops = shoulder_top(xs)
    ok = tops < h
    if ok.sum() < 10:
        continue
    # slope of the shoulder near this edge, in rows per column moving outward
    dist = (xs - xs.min()) if side == 1 else (xs.max() - xs)
    slope = -np.polyfit(dist[ok], tops[ok], 1)[0]
    slope = float(np.clip(slope, 0.12, 0.4))   # shoulders flatten out as they run off the frame
    edge_top = tops[0] if side == 0 else tops[-1]
    for k in range(pad):
        x = pad - 1 - k if side == 0 else pad + w + k
        top = edge_top + slope * (k + 1)
        rows = np.arange(out.shape[0])
        keep = np.clip(rows - top, 0, 2) / 2.0          # 2px soft edge along the new shoulder line
        alpha[:, x] = np.minimum(alpha[:, x], keep * 255)

out[:, :, 3] = alpha.astype(np.uint8)
cv2.imwrite(dst, out)
print(f'widened {w} -> {W}')
