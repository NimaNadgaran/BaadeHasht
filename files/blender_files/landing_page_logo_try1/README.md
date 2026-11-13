# Landing-page logo — try 01

An actual 3D camera journey following the blue arrows in `according_image.png`, ending with a straight vertical launch and a fast rotation into the complete logo/wordmark reveal. This is an isolated design attempt; the website is not changed.

## Open first

- `preview.html` — local player and shot breakdown; open in a browser after rendering.
- `landing_page_logo_preview.mp4` — 1280 × 720, H.264, silent, 6 seconds at 24 fps.
- `landing_page_logo_1080p.mp4` — 1920 × 1080 delivery render, 128 samples per frame.
- `landing_page_logo_try1.blend` — editable Blender scene with packed original textures.
- `storyboard/` — current rendered camera and sunlight checkpoints, listed in `scene_info.json`.
- `landing_page_logo_before_lighting.blend` — preserved scene before this lighting revision.

## Creative direction

| Time | Shot |
| --- | --- |
| 0–2.5 s | Fast, constant-distance travel from the bottom-left start around the bottom-right curve, up the crossover, clockwise around the upper loop, then through the lower-left loop to the final lower-right arrow. |
| 2.5–2.92 s | Straight-up takeoff, perpendicular (90 degrees) to the logo plane. X/Y and camera orientation stay fixed; only height changes. |
| 2.92–3.25 s | An eight-frame snap rotation and small lens change reveal the complete logo. The camera stays directly above the path endpoint. |
| 3.08–3.42 s | The original Persian wordmark quickly lights up below the symbol. |
| 3.46–5.46 s | With the camera stationary overhead, one warm studio-sun source arcs left to right. Its reflection crosses the polished logo, then clears the right side. |
| 5.46–6 s | The source stops off-axis and fades out; the complete identity holds without a moving highlight. End, not a loop. |

Smoked violet metal, polished clearcoat, satin bevels, a neutral graphite studio, and restrained highlight bloom. The journey is deliberately dimmer and less saturated. The moving warm light appears only after the overhead reveal; it is a real animated area source, not a painted glow or an emissive sweep on the logo. The animation does not loop back through the reveal.

### Camera / background revision

The traveling camera sits close to the surface and looks forward at an 11-degree downward pitch. The purple band reads as a curving road, with dark surroundings visible above it. A seamless 360-degree graphite cyclorama follows every camera heading. Fine procedural satin grain and a broad elliptical falloff replace the cloudy violet background, with no external texture dependencies. The path is traced from the supplied annotation, including its crossing of the road gap; it is not restricted to the earlier upper-loop route. Camera timing and geometry are unchanged by the lighting revision.

### Sunlight controls

`SWEEP_START_FRAME = 84` and `SWEEP_END_FRAME = 132` in `build_scene.py` control the single pass. The light named `Sun sweep | left to right polished reflection` has baked location/rotation keys and editable power keys. It travels along an elevated arc, peaks near the center, then moves beyond the logo's reflection angle before stopping. All transforms and power remain constant during the final hold. The muted base lighting remains so the logo does not disappear after the reflection clears. Total duration is extended to six seconds to give the reflection room without changing the existing camera journey.

## Why this method

1. **Use real geometry, not a flat image pretending to be 3D.** The supplied PNG has an opaque black background and baked glow. The script traces its colored silhouette, including holes, road dashes, play triangle, and location pin, then extrudes and bevels those contours. The original gradient is UV-mapped onto the top surfaces.
2. **Preserve the actual brand shape.** The Persian wordmark is traced from the supplied image too; this avoids Arabic-shaping/font substitution issues in Blender text objects. `logo_trace.svg` is also exported for inspection/editing.
3. **Separate the run, vertical launch, and snap rotation.** The annotated route is sampled by arc length, keeping speed consistent through dense and sparse control points. The launch holds the endpoint's X/Y coordinates and camera orientation. Only after reaching altitude does the camera rapidly rotate via quaternion interpolation, without sideways movement. The scene's curve is a visual guide, not a live constraint: change the reference-image pixel coordinates in `route_points(logo)` and rebuild, or edit the baked camera keys directly. Timing is controlled by `PATH_END_FRAME`, `TAKEOFF_END_FRAME`, and `ROTATION_END_FRAME`.
4. **Render a video for this first website attempt.** No WebGL runtime or 3D download is needed in the browser. The `.blend` remains editable for later versions.
5. **Render resumable PNG frames before encoding.** A failed encode does not discard the 3D rendering work.

The contour tracing is a reconstruction from raster artwork, not an original vector master. Bevels and material response intentionally add depth; an original SVG would make future precision refinements easier.

## Rebuild / render

From this folder in PowerShell:

```powershell
.\build.ps1
.\build.ps1 -Storyboard
.\build.ps1 -Render
.\build.ps1 -Final
```

Pass `-BlenderPath 'C:/path/to/blender.exe'` if needed. Built for the locally installed Blender 5.2.2 LTS. No pip packages, extensions, or downloaded models are required.

To resume rendering without rebuilding the scene:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background './landing_page_logo_try1.blend' --python-exit-code 1 --python './render_scene.py'
```

Completed frames are tracked in a manifest and reused only when the saved Blender scene and render settings match. Changing the scene automatically re-renders the frames, so an old render cannot silently appear in a new preview. Keep the final half-second as a hold when integrating into the landing page.

## References

- Blender camera/path constraints: https://docs.blender.org/manual/en/latest/animation/constraints/relationship/follow_path.html
- Blender curve geometry, extrusion and bevels: https://docs.blender.org/manual/en/latest/modeling/curves/properties/geometry.html
- Blender rendering workflow: https://docs.blender.org/manual/en/latest/render/workflows/animations.html
- Blender Python API: https://docs.blender.org/api/current/

The installed Blender API was queried before authoring to account for Blender 5.2's compositor node groups and menu sockets, video output settings, and EEVEE properties.
