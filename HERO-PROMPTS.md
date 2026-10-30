# Hero: portrait, helmet model and pipeline

The hero is a studio portrait shown as a 3D head, plus a 3D helmet the cursor reveals.

- **Portrait**: generated in Canva from `Downloads/muhsin-linkedin-profile.jpg`, styled
  after the original site's photo (curls, direct gaze, stubble, swirl fleece) with your
  face and Lando's compact curls and framing. It's page 4 of the Canva design
  "Blank square Instagram photo canvas".
- **Helmet**: a modelled GLB at `assets/models/helmet.glb` ("F1 Helmet" by Miopass on
  Sketchfab, CC Attribution). `js/helmet.js` replaces its livery with yours. If the file
  is missing, the site falls back to a helmet modelled in code.
- **Still images of you in the helmet** (menu tile, On Brand, footer) use `helmet-on.webp`,
  rendered from the same 3D head and helmet by `tools/hero/still.html` (see the end).

## Prompt 1: portrait (Lando-style)

Attach your headshot as the reference image. Square 1:1.

> Studio portrait of the exact same young man from the reference photo. Keep his face exactly: same face shape, skin tone, eyes, eyebrows, nose, lips and jawline, so he is clearly recognisable. Recreate this precise editorial F1-driver portrait setup: perfectly front-facing, head straight and level, looking directly into the lens with a calm, intense, neutral expression, lips relaxed and closed, no smile. Hair: short, tight dark curls kept close to the head, the curly top only a few centimetres high and neat, short tapered sides above the ears, so the head silhouette is compact and not bushy. Light even stubble on the jaw, chin and upper lip. He wears a thick black sherpa fleece jacket with a bold taupe-grey abstract swirl pattern, the high collar standing up around his neck and the zip pulled down a little, with a round metal ring zip pull at the chest. Exact framing: square image, head centred horizontally; top of the curls about 19% below the top edge; eyes at about 47% from the top; chin at about 63%; the collar and broad shoulders fill the whole width of the bottom of the frame and run off both side edges and the bottom edge. Soft, even, cool high-key studio light from the front, gentle shadows under the cheekbones. Plain seamless light grey-white background (#F0F0EA). Photorealistic, razor sharp, natural skin texture, 85mm lens, no text, no logos.

## Prompt 2: you wearing a helmet (optional, a photo alternative to the 3D still)

Attach the image from prompt 1 as the reference. Square 1:1.

> Edit the reference photo. Keep everything exactly the same: same framing, same crop, same camera angle, same position and size of the head and shoulders, same jacket, same plain off-white background, same lighting. The only change: he is now wearing a full-face Formula 1 racing helmet on his head, facing straight at the camera. The helmet is glossy lime yellow (#D2FF00) with a bold black organic squiggle and blob pattern livery, a dark smoked mirrored visor closed over the eyes, a small black chin vent, and the helmet sits naturally on his head so it is slightly larger than his head. No text, no logos, no sponsor names. Photorealistic, high resolution, studio product-photography finish.

These work in Canva's image generator, Gemini (Nano Banana) or any editor that takes a
reference photo.

## Turning the portrait into the 3D head

From `Downloads/#4`, with the portrait saved as `portrait.png`:

```bash
node tools/hero/cutout.cjs portrait.png portrait-cut.png
python tools/hero/extend_sides.py portrait-cut.png portrait-wide.png
python tools/hero/build_textures.py portrait-wide.png assets/img
```

- `cutout.cjs` removes the background with `@imgly/background-removal-node` from the
  old `04 Projects - Web & Code/mdp/node_modules`.
- `extend_sides.py` mirrors the jacket out to the sides and down, so the shoulders run
  off the frame like the original's.
- `build_textures.py` writes `head-diffuse.webp` and `head-depth.webp` with your eyes on
  the original's eye line. An optional third argument (default `0.134`) sets the head's
  size; raise it if the head reads small next to the original, lower it if big.

Save `portrait-wide.png` as `assets/img/hero-muhsin.webp` too (the still shown if WebGL
is unavailable). The helmet's size and place don't depend on the photo: `HELMET_FIT` in
`js/main.js` was fitted so the helmet covers the same box on screen as the original's
(494 x 598px from 44px down at 1024x768, tilted forward 0.06 pi).

## Rendering the still of you in the helmet

With the local server running, open `http://localhost:5182/tools/hero/still.html` (add
`?turn=0.2` to turn the helmet), wait a moment, then in the browser console run
`copy(window.stillPNG)` and save it, or use any headless capture. Crop off the bottom
mirrored strip and save it as `assets/img/helmet-on.webp`.

## Swapping the helmet model

Any full-face helmet GLB works. Slim it first (drops its textures, keeps the cut-out
masks for parts named in the arguments), then save it as `assets/models/helmet.glb`:

```bash
python tools/hero/slim_glb.py downloaded.glb assets/models/helmet.glb Helmet_Component Helmet_glass
```

The loader scales it by width, turns its visor to face the camera and re-skins it by
part name (glass/visor → mirrored visor, component/trim → black trim, inside/padding →
fabric, the rest → livery). Adjust `HELMET_FIT.modelSx` / `modelTop` in `js/main.js` so
it covers the hair with the eye port over the eyes, and credit the model's author in the
footer if its licence asks for it.
