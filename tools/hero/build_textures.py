"""Lay the portrait out in the same 2048px texture space as the original site's
head texture (eyes centred at 49.85% across and 47.4% down), and draw a soft
depth map for the 3D displacement. Writes head-diffuse.webp and head-depth.webp.
Usage: python -I build_textures.py <portrait-cutout.png> <out_dir> [ipd_fraction=0.134]"""
import os
import sys
import cv2
import numpy as np

pp, out = sys.argv[1:3]
P = cv2.imread(pp, cv2.IMREAD_UNCHANGED)
T = 2048
# eye line and centre measured from the original's head texture; IPD sets the head's
# size. 0.134 makes this portrait's face (eyes, nose, mouth, cheeks) overlay Lando's;
# tune it if a new photo's head reads too big or small
EYE_X, EYE_Y = 0.4985 * T, 0.474 * T
IPD = float(sys.argv[3]) * T if len(sys.argv) > 3 else 0.134 * T

eyes = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml').detectMultiScale(
    cv2.cvtColor(P[:, :, :3], cv2.COLOR_BGR2GRAY), 1.1, 8, minSize=(40, 40))
eyes = sorted(eyes, key=lambda e: e[1])[:2]
c = [(e[0] + e[2] / 2, e[1] + e[3] / 2) for e in eyes]
ex, ey = (c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2
ipd = float(np.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1]))
s = IPD / ipd
M = np.float32([[s, 0, EYE_X - ex * s], [0, s, EYE_Y - ey * s]])
warp = lambda im: cv2.warpAffine(im, M, (T, T), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
head = warp(P)
cv2.imwrite(f'{out}/head-diffuse.webp', head, [cv2.IMWRITE_WEBP_QUALITY, 90])
print(f'scale {s:.3f}  eyes ({ex:.0f},{ey:.0f}) ipd {ipd:.1f}')

yy, xx = np.mgrid[0:T, 0:T].astype(np.float32)
A = head[:, :, 3].astype(np.float32) / 255.0

# head: rows above the neck; find hair top, ear width and the neck from the alpha
rows = (A > 0.5).sum(axis=1)
hair = int(np.nonzero(rows)[0].min())
neck = int(EYE_Y) + int(np.argmin(rows[int(EYE_Y):int(EYE_Y + 0.25 * T)]))
ear_w = rows[int(EYE_Y)]
cx, cy = EYE_X, (hair + neck) / 2
rx, ry = ear_w / 2 * 1.04, (neck - hair) / 2 * 1.06
r2 = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
head_d = np.where(r2 < 1, 0.52 + 0.26 * np.sqrt(np.clip(1 - r2, 0, 1)), 0)
nose = 0.05 * np.exp(-(((xx - EYE_X) / (0.13 * IPD)) ** 2 + ((yy - (EYE_Y + 0.55 * IPD)) / (0.4 * IPD)) ** 2))
head_d = head_d + nose * (r2 < 1)
neck_d = np.where((yy > cy) & (yy < neck + 0.12 * T), 0.5 - 0.12 * ((xx - cx) / rx) ** 2, 0)
torso_d = np.where(yy > neck - 0.02 * T, 0.36 + 0.1 * np.clip(1 - np.abs(xx - cx) / (0.5 * T), 0, 1), 0)
depth = np.maximum.reduce([head_d, neck_d, torso_d]) * (A > 0.05)
depth = cv2.GaussianBlur(depth.astype(np.float32), (0, 0), 22) * np.clip(A * 1.5, 0, 1)
cv2.imwrite(f'{out}/head-depth.webp', cv2.resize((np.clip(depth, 0, 1) * 255).astype(np.uint8), (512, 512), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 95])

preview = np.dstack([depth] * 3)
cv2.imwrite(os.path.join(os.path.dirname(os.path.abspath(pp)), 'depth-preview.jpg'), cv2.resize((preview * 255).astype(np.uint8), (512, 512)))
