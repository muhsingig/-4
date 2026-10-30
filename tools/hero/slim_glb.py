"""Slim a helmet GLB for the web: keep every mesh, drop its textures (the site paints its
own livery), but keep small alpha masks for the parts whose shapes are cut out by
transparency (named in --keep, e.g. Helmet_Component, Helmet_glass). Masks are stored
as 1024px PNGs: white where the part is solid, transparent where it is cut away.
Usage: python -I slim_glb.py <in.glb> <out.glb> [material names to keep masks for...]"""
import io
import sys
import json
import struct
from PIL import Image

src, dst, *keep = sys.argv[1:]
keep = set(keep or ['Helmet_Component', 'Helmet_glass'])
raw = open(src, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
gltf = json.loads(raw[20:20 + jl])
bin_start = 20 + jl + 8
binary = raw[bin_start:]


def view_bytes(i):
    v = gltf['bufferViews'][i]
    o = v.get('byteOffset', 0)
    return binary[o:o + v['byteLength']]


# 1. masks for the kept materials, every other texture reference removed
masks = {}   # material index -> png bytes
for mi, m in enumerate(gltf['materials']):
    pbr = m.get('pbrMetallicRoughness', {})
    if m.get('name') in keep and 'baseColorTexture' in pbr:
        tex = gltf['textures'][pbr['baseColorTexture']['index']]
        img = Image.open(io.BytesIO(view_bytes(gltf['images'][tex['source']]['bufferView']))).convert('RGBA')
        a = img.getchannel('A').resize((1024, 1024), Image.LANCZOS)
        mask = Image.merge('RGBA', (Image.new('L', a.size, 255),) * 3 + (a,))
        buf = io.BytesIO()
        mask.save(buf, 'PNG', optimize=True)
        masks[mi] = buf.getvalue()
    for k in ('baseColorTexture', 'metallicRoughnessTexture'):
        pbr.pop(k, None)
    for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture'):
        m.pop(k, None)
    m.pop('extensions', None)

# 2. rebuild the binary: geometry views first, then the masks
new_bin = bytearray()
new_views = []
remap = {}


def add_view(data, extra):
    while len(new_bin) % 4:
        new_bin.append(0)
    v = {'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(data)}
    v.update(extra)
    new_bin.extend(data)
    new_views.append(v)
    return len(new_views) - 1


for acc in gltf['accessors']:
    i = acc.get('bufferView')
    if i is None:
        continue
    if i not in remap:
        old = gltf['bufferViews'][i]
        extra = {k: old[k] for k in ('byteStride', 'target') if k in old}
        remap[i] = add_view(view_bytes(i), extra)
    acc['bufferView'] = remap[i]

images, textures = [], []
for mi, png in masks.items():
    images.append({'bufferView': add_view(png, {}), 'mimeType': 'image/png', 'name': f"{gltf['materials'][mi]['name']}_mask"})
    textures.append({'source': len(images) - 1})
    gltf['materials'][mi].setdefault('pbrMetallicRoughness', {})['baseColorTexture'] = {'index': len(textures) - 1}

gltf['bufferViews'] = new_views
gltf['images'] = images
gltf['textures'] = textures
gltf.pop('samplers', None)
gltf.pop('extensionsUsed', None)
gltf.pop('extensionsRequired', None)
while len(new_bin) % 4:
    new_bin.append(0)
gltf['buffers'] = [{'byteLength': len(new_bin)}]

js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
while len(js) % 4:
    js += b' '
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(new_bin))
out += struct.pack('<II', len(js), 0x4E4F534A) + js
out += struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin)
open(dst, 'wb').write(out)
print(f'{len(raw) / 1e6:.1f} MB -> {len(out) / 1e6:.1f} MB, masks for {[gltf["materials"][i]["name"] for i in masks]}')
