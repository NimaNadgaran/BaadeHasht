import importlib.util
from pathlib import Path

import bpy


DIRECTORY = Path(__file__).resolve().parent
BLEND_FILE = Path(bpy.data.filepath)
if BLEND_FILE.stem not in {'landingpage_logo_dark', 'landingpage_logo_light'}:
    raise RuntimeError('Open landingpage_logo_dark.blend or landingpage_logo_light.blend first.')
SPECIFICATION = importlib.util.spec_from_file_location(
    'landingpage_renderer', DIRECTORY / 'landing_page_logo_try1' / 'render_scene.py'
)
RENDERER = importlib.util.module_from_spec(SPECIFICATION)
SPECIFICATION.loader.exec_module(RENDERER)
RENDERER.DIRECTORY = BLEND_FILE.parent
ORIGINAL_ENCODE = RENDERER.encode


def encode(frame_directory, output, width, height, frame_count, fps):
    filename = output.name.replace('landing_page_logo', BLEND_FILE.stem)
    ORIGINAL_ENCODE(frame_directory, output.with_name(filename), width, height, frame_count, fps)


RENDERER.encode = encode


if __name__ == '__main__':
    RENDERER.main()
