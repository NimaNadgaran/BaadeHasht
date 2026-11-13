import json
from pathlib import Path

import bpy


DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parent


def encode_variant(variant):
    source = ROOT / 'files' / 'blender_files' / f'landingpage_logo_{variant}' / 'frames_final'
    frames = [source / f'frame_{frame:04d}.png' for frame in range(1, 145)]
    missing = [str(frame) for frame in frames if not frame.is_file()]
    if missing:
        raise RuntimeError(f'Missing rendered frames: {missing[:3]}')
    destination = DIRECTORY / f'3d_{variant}' / 'media'
    destination.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.new(f'Scroll-optimized {variant}')
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 144
    editor = scene.sequence_editor_create()
    strip = editor.strips.new_image('Ball-free logo journey', str(frames[0]), channel=1, frame_start=1)
    for frame in frames[1:]:
        strip.elements.append(frame.name)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.media_type = 'VIDEO'
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.gopsize = 1
    scene.render.ffmpeg.max_b_frames = 0
    scene.render.ffmpeg.constant_rate_factor = 'HIGH'
    scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
    scene.render.ffmpeg.audio_codec = 'NONE'
    scene.render.filepath = str(destination / 'intro.mp4')
    bpy.context.window.scene = scene
    bpy.ops.render.render(animation=True, scene=scene.name)
    metadata = {
        'source': f'files/blender_files/landingpage_logo_{variant}/frames_final',
        'frames': 144, 'fps': 24, 'duration': 6, 'width': 1920, 'height': 1080,
        'gop_size': 1, 'b_frames': 0, 'ball_removed': True,
    }
    (destination / 'info.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print('SCROLL VIDEO READY:', destination / 'intro.mp4', flush=True)


for variant in ('dark', 'light'):
    encode_variant(variant)
