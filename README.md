# BaadeHasht

Run `npm run dev` from the project root. No dependencies or build step are required. The default site is at `http://localhost:5173`.

## Pages

- `/` — main website with day/night controls. Day uses the vivid light Blender animation; night uses the graphite dark animation. Switching themes stays on the same page and at the same animation frame. The choice is saved locally; without a saved choice, the system color scheme is used.
- `/frontend/3d_light/` — independent light preview.
- `/frontend/3d_dark/` — independent dark preview.
- `/frontend/basic/` — preserved original frontend.
- `/frontend/` — comparison gallery linking to all three previews.

The old `d3_light`, `d3_dark` and `basic_web` URLs redirect to their renamed counterparts. Directory URLs work with or without the final slash.

## Scroll animation

The animation now uses a canvas and **144 actual Blender-rendered frames**, rather than seeking a paused video. This avoids autoplay permissions, video-decoder delays and timelines advancing without the picture changing. No Blender scenes are re-rendered or modified.

The WebP frame sets in `frontend/3d_light/frames` and `frontend/3d_dark/frames` are derived from the existing ball-free renders. The complete sequences weigh approximately 2.48 MB and 1.35 MB respectively. Images are fetched ahead into the browser cache, with a bounded 24-frame decoded-image cache.

The scene maps to **2400 pixels of desktop scroll / 1800 pixels on mobile**, giving the camera movement a gentler pace at native browser scroll speed. Time-based easing and blending between adjacent frames soften wheel steps. These distances are controlled by `data-scroll-distance` and `data-mobile-scroll-distance` on each page's body. Native wheel, touch, trackpad and keyboard input work in either direction. No wheel events are captured or blocked. The camera journey, overhead reveal, moving reflection and final hold are all retained.

Reduced-motion preferences remove the extra catch-up interpolation, but do not silently disable intentional scroll scrubbing or collapse the scroll space. The only animation UI is a small, non-interactive scroll percentage in the upper-left corner; playback controls, timeline, frame counts and duration labels are omitted. Failed-frame and no-JavaScript cases show the final logo with the rest of the site accessible.

## Structure

`frontend/home.html` is the default page, reusing only the needed 3D layout and shared components rather than rebuilding from the basic frontend. Theme initialization and shared palettes live in `frontend/shared/theme-init.js` and `frontend/shared/themes.css`. Scroll drawing, caching and theme changes live in `frontend/shared/experience.js`.

Original fonts, images, videos and Blender files remain under `files/`. The local server serves public frontend assets and explicitly allowed rendered images, not Git metadata, Blender files or server source. It binds to localhost, supports byte-range video requests, and falls back from port 5173 through 5183 when necessary. Set `PORT` for a fixed port. Use the server rather than opening HTML files directly from disk.

The retained `media/intro.mp4` files are optional video exports, no longer used for scroll rendering. `frontend/prepare_media.py` can rebuild them after regenerating the 1080p PNGs with the Blender renderer. This is still a frontend prototype, without a backend or invented episode catalogue. The Persian content direction, local Vazirmatn font and public YouTube destination are retained.

## Media quality and cleanup

The website uses 144 compressed WebP frames per theme, from a six-second, 24 fps source. The light sequence is approximately 2.48 MB and the dark sequence 1.35 MB. Resolution and source frame count are intentionally unchanged to avoid increasing downloads on slower connections. Existing animation easing and adjacent-frame blending improve visual continuity without downloading extra frames. MP3 is an audio format; it is not the format used for this animation.

Regenerable Blender `frames/` and `frames_final/` directories, render logs and Python bytecode caches have been removed from `files/`. Editable Blender scenes, build/render scripts, scene metadata, preview videos, storyboards, branding images, the web font and its license are preserved. Runtime WebP sequences under `frontend/` are also preserved.

To recreate raw renders, follow the rendering commands in each `files/blender_files/landingpage_logo_*/README.md`; use `--quality final` to recreate `frames_final/` before running `frontend/prepare_media.py`.

The root `.gitignore` excludes dependencies, build/test output, local editor settings, secrets, deployment state, logs, caches and Blender backups/raw render directories. Application source, package lockfiles, runtime assets, editable `.blend` sources and font licenses remain eligible for version control. Ignore rules do not untrack files that were already staged or committed.
