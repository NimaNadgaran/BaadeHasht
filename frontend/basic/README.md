# BaadeHasht original landing-page preview

A standalone, Persian/RTL design preview. No framework, package installation, or build step is required.

## Run

```sh
npm run dev
```

Run this command from `frontend/basic`. Open the URL printed in the terminal (normally http://localhost:5173). If that port is occupied, the server tries the next available port, up to 5183. Set `PORT` to require a specific port instead. Alternatively, run the project-root server and visit `/frontend/basic/`.

The supplied video plays once, then fades into the landing page. The ambient light afterward is CSS animation, not a loop of the logo reveal. Replay, skip, and motion controls are available. Reduced-motion preferences and autoplay failures show the finished landing page directly.

The intro expects the original clip at `files/videos/Dark.mp4`. If it is missing, the landing page appears without the intro.

This is a visual prototype only: no episode database, admin panel, or other future features. The watch buttons link to the public `@baadehasht` YouTube channel. Landing-page copy is provisional.

Original assets remain unchanged. `poster.jpg` is a still extracted from the supplied video. Vazirmatn is distributed under the SIL Open Font License; see `files/fonts/OFL.txt`.
