# Muhsin Gigani — portfolio (landonorris.com rebuild)

A one-page portfolio that copies the layout, type scale, colours and motion of
[landonorris.com](https://landonorris.com) (built by OFF+BRAND), with Muhsin's
photo, projects and copy in place of Lando's. Plain HTML/CSS/JS, no build step.

## Run it

```bash
python -m http.server 5182 --directory "C:/Users/muhsi/Downloads/#4"
```

Then open http://localhost:5182. It has to be served over http, not opened as
a file, because `js/main.js` is an ES module.

## What maps to what

| landonorris.com | here |
| --- | --- |
| 3D head (depth-displaced photo) and a modelled 3D helmet with studio reflections, turning toward the mouse, 15° camera at z=3 | same: head in `js/gl.js` from `head-*.webp`, your face placed where Lando's sits; helmet is `assets/models/helmet.glb` ("F1 Helmet" by Miopass, CC BY 4.0), re-skinned in `js/helmet.js` |
| Helmet revealed by a fluid cursor trail, grey noise blobs, idle auto-cursor, wireframe helmet shell with a scan line | same |
| Hovering the "next race" card wipes the full helmet in | hovering the "Based in" card does the same |
| Whole hero frame shrinks to a card with a camera push-in and olive filter, marquee rows behind, signature | same scroll morph, "Message from Muhsin" |
| Topographic lines behind every section | same noise field, drawn in the fixed GL canvas |
| "Next race" card, bottom left | "Based in Mumbai" card |
| Impact statement with lime line sweeps | "Strategy that ships…" |
| Horizontal photo track with two quotes | life + NMACC photos, two quotes from the résumé |
| On Track / Off Track | On Brand / Off Script |
| Helmets hall of fame | Projects hall of fame (12 cards) |
| Lando Store / World Drivers' Champion | Django internship: "100+ clinics, six accounts, one intern" |
| Partners & campaigns + "Collabs" scrawl | Brands & campaigns + "Clients" scrawl |
| What's up on socials | same, with LinkedIn / GitHub / portfolio / email |
| Footer "Always bringing the fight." | "Always shipping the plan." |

## Files

- `index.html`: all markup and copy
- `css/style.css`: tokens (same hex values as the original), fluid rem scale from a 1728px design width
- `js/main.js`: Lenis smooth scroll, GSAP ScrollTrigger scenes, loader, menu
- `js/gl.js`: one fixed three.js canvas: stable-fluids cursor sim, stepped noise contours, the 3D head, the hero frame
- `js/helmet.js`: loads the helmet model and re-skins it (lime livery, mirrored visor, dark trims, studio lighting); also a coded fallback helmet
- `assets/models/helmet.glb`: the helmet model, slimmed from 60 MB to 3.9 MB by `tools/hero/slim_glb.py`
- `tools/hero/still.html`: renders the 3D head wearing the helmet to a transparent PNG (`helmet-on.webp`)
- `tools/hero/`: scripts that turn a generated portrait + helmet image into the hero assets
- `HERO-PROMPTS.md`: the image prompts and the asset pipeline
- `assets/img/`: every image, as webp
- `assets/muhsin-gigani-resume.pdf`: linked from the Résumé buttons

## Changing things

- **Copy**: edit `index.html` directly. The impact statement's serif words are the `<em>` tags.
- **Project cards**: the `.proj-card` links in `index.html`. They all point at
  muhsingigani-portfolio.vercel.app until each project has its own URL.
- **Hero photo**: generated in Canva from `Downloads/muhsin-linkedin-profile.jpg`
  (a studio portrait plus a matching helmet shot), laid out in the same 2048px texture
  space as the original's 3D head so your eyes land where Lando's do. To change the look,
  follow `HERO-PROMPTS.md`.
- **Helmet**: colours, livery and visor live in `js/helmet.js` (`#d2ff00` shell, black
  squiggle lines from 3D noise, smoked iridescent visor). `HELMET_FIT` in `js/main.js`
  sizes and places it: fitted so it fills the same box on screen as the original's
  helmet, with the original's 0.06 pi forward tilt. It turns with the head at two-thirds,
  as on the original (`helmetRig.rotation` in `js/gl.js`). The footer credits the
  model's author, as its CC BY licence requires; keep that line if you keep the model.

## Substitutions

- Fonts: Brier (commercial) → Instrument Serif; Mona Sans is the same family, from Google Fonts.
  The scrawls use Kaushan Script.
- The original's Rive animations (logo, signature, helmet icons) are redrawn as SVG.
- The original's head is a photo with a hand-made depth map; here the depth map is drawn
  by `tools/hero/build_textures.py`. Its helmet is its own GLB with McLaren textures and an
  HDRI; here it's a free F1 helmet model with its original textures removed and your
  livery painted on, lit by a built-in studio environment. Its size, position, tilt and
  motion follow the original's numbers.
- Partner logos are set as type, not real logos.
- Libraries load from jsDelivr at pinned versions: GSAP 3.12.5, Lenis 1.1.13, three 0.160.0.
