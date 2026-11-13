# BaadeHasht

Run `npm run dev` from the project root. No dependencies or build step are required. The default site is at `http://localhost:5173`.

## Pages

- `/` — main website with day/night controls. Day uses the vivid light Blender animation; night uses the graphite dark animation. Switching themes preserves the page, text position and animation phase while the new theme loads. The choice is saved locally; without a saved choice, the system color scheme is used.
- `/frontend/3d_light/` — independent light preview.
- `/frontend/3d_dark/` — independent dark preview.
- `/frontend/basic/` — preserved original frontend.
- `/frontend/` — comparison gallery linking to all three previews.

The old `d3_light`, `d3_dark` and `basic_web` URLs redirect to their renamed counterparts. Directory URLs work with or without the final slash.

## Background animation

The animation now uses a canvas and **144 actual Blender-rendered frames**, rather than seeking a paused video. This avoids autoplay permissions, video-decoder delays and timelines advancing without the picture changing. No Blender scenes are re-rendered or modified.

The WebP frame sets in `frontend/3d_light/frames` and `frontend/3d_dark/frames` are derived from the existing ball-free renders. The complete sequences weigh approximately 2.48 MB and 1.35 MB respectively. Before starting, the selected theme's complete sequence is downloaded into local blob URLs and the first eight frames are decoded. Font and header-logo loading run alongside this, with at most two additional seconds of waiting; a slow or broken interface asset cannot stop background playback. Six parallel download workers and a bounded 16-frame decoded-image cache limit memory use; nearby frames are decoded ahead of playback. Posters reuse the lightweight final WebP frame. The other theme is not downloaded until selected.

After loading, the original camera journey plays automatically at its normal **six-second duration**, independent of scrolling. The text appears only after the intro, then scrolls natively over the fixed logo background. Existing navigation links allow readers to bypass the intro. The small upper-left percentage measures document scrolling, not playback.

At the handoff, the reading shade crossfades over 2.4 seconds instead of switching abruptly. A full-height opening screen fades in the eyebrow, headline lines and short introduction in sequence, followed by a small “Scroll” cue. The main sections remain below the fold and fade in as they enter the viewport, rather than appearing together on a timer. Reduced-motion settings remove the text lifts but retain the requested soft opacity fades. The original intro and continuous light-loop playback are unchanged.

Once the intro ends, the stationary-camera light sweep (frames **84–132**) loops backwards and forwards over **12 seconds per full round trip**. Cosine timing slows the light at either edge and accelerates it through the middle; adjacent-frame blending keeps transitions smooth. The intro's final hold matches the loop's right-hand endpoint, so the camera journey never restarts. The loop uses already-downloaded frames and requires no additional media or Blender modifications. Background tabs pause the animation clock. Theme changes preload the new sequence without hiding already-revealed text or replaying the intro.

Background autoplay is explicitly enabled for both the intro and light loop, including when the operating system requests reduced motion; that preference still disables supplementary CSS transitions and text-reveal effects. Failed header-image or font loads do not disable the background. Failed frame downloads or 45 seconds without download progress reveal the content with a static poster; reconnecting retries the background. The timeout resets after every downloaded frame, allowing slow but progressing connections to finish. Failures include a console warning and a `data-playback-error` reason on the body rather than silently appearing paused. No-JavaScript visitors also retain a poster and readable content. Three clearly identified sample Persian stories demonstrate the reading/scrolling layout.

## Structure

`frontend/home.html` is the default page, reusing only the needed 3D layout and shared components rather than rebuilding from the basic frontend. Theme initialization and shared palettes live in `frontend/shared/theme-init.js` and `frontend/shared/themes.css`. Scroll drawing, caching and theme changes live in `frontend/shared/experience.js`.

Original fonts, images, videos and Blender files remain under `files/`. The local server serves public frontend assets and explicitly allowed rendered images, not Git metadata, Blender files or server source. It binds to localhost, supports byte-range video requests, and falls back from port 5173 through 5183 when necessary. Set `PORT` for a fixed port. Use the server rather than opening HTML files directly from disk.

The retained `media/intro.mp4` files are optional video exports, no longer used for scroll rendering. `frontend/prepare_media.py` can rebuild them after regenerating the 1080p PNGs with the Blender renderer. This is still a frontend prototype, without a backend or invented episode catalogue. The Persian content direction, local Vazirmatn font and public YouTube destination are retained.

## Media quality and cleanup

The website uses 144 compressed WebP frames per theme, from a six-second, 24 fps source. The light sequence is approximately 2.48 MB and the dark sequence 1.35 MB. Resolution and source frame count are intentionally unchanged to avoid increasing downloads on slower connections. Adjacent-frame blending improves visual continuity without downloading extra frames. MP3 is an audio format; it is not the format used for this animation.

Regenerable Blender `frames/` and `frames_final/` directories, render logs and Python bytecode caches have been removed from `files/`. Editable Blender scenes, build/render scripts, scene metadata, preview videos, storyboards, branding images, the web font and its license are preserved. Runtime WebP sequences under `frontend/` are also preserved.

To recreate raw renders, follow the rendering commands in each `files/blender_files/landingpage_logo_*/README.md`; use `--quality final` to recreate `frames_final/` before running `frontend/prepare_media.py`.

The root `.gitignore` excludes dependencies, build/test output, local editor settings, secrets, deployment state, logs, caches and Blender backups/raw render directories. Application source, package lockfiles, runtime assets, editable `.blend` sources and font licenses remain eligible for version control. Ignore rules do not untrack files that were already staged or committed.
