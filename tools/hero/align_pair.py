"""Build the hero image pair from the generated portrait + helmet cutouts:
pad headroom on top, keep only the helmet from the second image, and move it so
the visor sits on the eyes. Writes portrait/helmet PNGs on one shared canvas.
Usage: python -I align_pair.py <portrait-cut.png> <helmet-cut.png> <outdir>"""
import sys
import cv2
import numpy as np

pp, hp, outdir = sys.argv[1:4]
P = cv2.imread(pp, cv2.IMREAD_UNCHANGED)
Hh = cv2.imread(hp, cv2.IMREAD_UNCHANGED)
h, w = P.shape[:2]
PAD = 120

# eye line from the portrait
eyes = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml').detectMultiScale(
    cv2.cvtColor(P[:, :, :3], cv2.COLOR_BGR2GRAY), 1.1, 8, minSize=(40, 40))
eyes = sorted(eyes, key=lambda e: e[1])[:2]
eye_y = float(np.mean([e[1] + e[3] / 2 for e in eyes]))
eye_x = float(np.mean([e[0] + e[2] / 2 for e in eyes]))

# helmet only: drop everything below the chin bar (the zip strip the remover kept)
a = Hh[:, :, 3] > 128
widths = a.sum(axis=1)
neck = next(y for y in range(int(h * 0.5), h) if widths[y] < 80)
Hh[neck:, :, 3] = 0
a = Hh[:, :, 3] > 128

# visor = rows where most of the helmet is near-black
g = cv2.cvtColor(Hh[:, :, :3], cv2.COLOR_BGR2GRAY)
frac = np.array([(g[y][a[y]] < 55).mean() if a[y].sum() > 150 else 0 for y in range(h)])
band = np.nonzero(frac > 0.55)[0]
band = band[(band > h * 0.15) & (band < neck - 40)]
vis_top, vis_bot = int(band.min()), int(band.max())
xs = np.nonzero(a[(vis_top + vis_bot) // 2])[0]
helmet_cx = (xs.min() + xs.max()) / 2

target_eye = vis_top + 0.42 * (vis_bot - vis_top)
dy = eye_y - target_eye
dx = eye_x - helmet_cx
print(f'eyes y={eye_y:.0f} x={eye_x:.0f}  visor {vis_top}-{vis_bot}  neck {neck}  shift dx={dx:.0f} dy={dy:.0f}')

canvas = (w, h + PAD)
def place(img, ox, oy):
    M = np.float32([[1, 0, ox], [0, 1, oy]])
    return cv2.warpAffine(img, M, canvas, flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))

Pout = place(P, 0, PAD)
Hout = place(Hh, dx, PAD + dy)
cv2.imwrite(f'{outdir}/pair-portrait.png', Pout)
cv2.imwrite(f'{outdir}/pair-helmet.png', Hout)

# measurements the shader needs, as fractions of the padded canvas height
pa = Pout[:, :, 3] > 128
hair_top = int(np.nonzero(pa.any(axis=1))[0].min())
pw = pa.sum(axis=1)
neck_p = int(h * 0.4) + int(np.argmin(pw[int(h * 0.4):int(h * 0.7)]))
print(f'canvas {canvas}  hair_top {hair_top / canvas[1]:.3f}  neck {neck_p / canvas[1]:.3f}  '
      f'eye_line {(eye_y + PAD) / canvas[1]:.4f}  helmet_top {np.nonzero((Hout[:, :, 3] > 128).any(axis=1))[0].min()}')

# the portrait wearing the helmet, for the menu tile, On Brand and the footer
on = Pout.astype(np.float32)
ha = Hout[:, :, 3:].astype(np.float32) / 255.0
on[:, :, :3] = on[:, :, :3] * (1 - ha) + Hout[:, :, :3] * ha
on[:, :, 3:] = np.maximum(on[:, :, 3:], Hout[:, :, 3:])
cv2.imwrite(f'{outdir}/pair-helmet-on.png', on.astype(np.uint8))

# preview: portrait with the helmet at 60% over it
bg = np.full((canvas[1], canvas[0], 3), 240, np.float32)
pa_f = Pout[:, :, 3:] / 255.0
comp = bg * (1 - pa_f) + Pout[:, :, :3] * pa_f
ha_f = Hout[:, :, 3:] / 255.0 * 0.6
comp = comp * (1 - ha_f) + Hout[:, :, :3] * ha_f
cv2.imwrite(f'{outdir}/pair-preview.jpg', cv2.resize(comp.astype(np.uint8), (540, 600)))
