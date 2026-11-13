import importlib.util
from pathlib import Path


DIRECTORY = Path(__file__).resolve().parent
SPECIFICATION = importlib.util.spec_from_file_location(
    'logo_renderer', DIRECTORY.parent / 'landing_page_logo_try1' / 'render_scene.py'
)
RENDERER = importlib.util.module_from_spec(SPECIFICATION)
SPECIFICATION.loader.exec_module(RENDERER)
RENDERER.DIRECTORY = DIRECTORY


if __name__ == '__main__':
    RENDERER.main()
