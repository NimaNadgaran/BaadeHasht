# Landing-page logo — vivid version

A separate brighter, more colorful treatment of the approved graphite animation. The original folder and scene are not modified.

## Open first

- `preview.html` — video player, storyboard and link to the graphite version.
- `landing_page_logo_try2_vivid.blend` — editable scene, original textures packed.
- `landing_page_logo_preview.mp4` — 1280 × 720, 64 samples per frame.
- `landing_page_logo_1080p.mp4` — 1920 × 1080, 128 samples per frame.

Both videos are silent H.264, six seconds at 24 fps.

## Treatment

Richer original violet/blue logo colors, brighter polished metal, cyan rim lighting, orchid accents and a warmer pearl fill. The fine satin studio background becomes luminous indigo/violet instead of charcoal. Exposure and ambient illumination are lifted while retaining the moving sunlight reflection and restrained bloom.

Camera poses, focal lengths, geometry, framing, sunlight trajectory and timing come directly from the approved `.blend`. The builder checks camera and sunlight transforms on all 144 frames before saving. The road journey, vertical launch, overhead reveal, single left-to-right reflection pass and stopped final hold are unchanged.

## Rebuild / render

Run in this folder using the installed Blender 5.2:

```powershell
.\build.ps1
.\build.ps1 -Storyboard
.\build.ps1 -Render
.\build.ps1 -Final
```

The builder loads `../landing_page_logo_try1/landing_page_logo_try1.blend` without saving changes to it. The render wrapper reuses the adjacent original version's resumable renderer, writing only to this vivid folder. Keep that folder alongside this one for rebuilding; the packed vivid `.blend` can be opened independently.

To resume a video render without rebuilding:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background './landing_page_logo_try2_vivid.blend' --python-exit-code 1 --python './render_scene.py' -- --quality final
```

`scene_info.json` records the source scene hash, timings and render settings. The website remains unchanged.
