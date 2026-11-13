# landingpage_logo_light

The brighter vivid violet/cyan version, with the small leading ball removed entirely. The original camera journey, colorful lighting, overhead sunlight sweep, timing and final hold are preserved. Six seconds, 24 fps. Original versions are not modified.

- `landingpage_logo_light.blend` — editable scene with packed textures.
- `landingpage_logo_light_preview.mp4` — 1280 × 720 preview.
- `landingpage_logo_light_1080p.mp4` — 1920 × 1080, 128-sample delivery render.
- `preview.html` — local player, storyboard and dark-version comparison link.

From `files/blender_files`, rebuild both copies:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python './build_landingpage_copies.py'
```

Render or resume this version from the same folder:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background './landingpage_logo_light/landingpage_logo_light.blend' --python-exit-code 1 --python './render_landingpage.py'
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background './landingpage_logo_light/landingpage_logo_light.blend' --python-exit-code 1 --python './render_landingpage.py' -- --quality final
```

The shared builder verifies camera poses on all 144 frames and records the source hash in `scene_info.json`. The shared renderer reuses the original resumable renderer. The packed `.blend` opens independently.
