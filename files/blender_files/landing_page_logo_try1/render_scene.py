import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import bpy


DIRECTORY = Path(__file__).resolve().parent


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--quality', choices=['preview', 'final'], default='preview')
    parser.add_argument('--encode-only', action='store_true')
    parser.add_argument('--frames', nargs='*', type=int)
    values = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(values)


def encode(frame_directory, output, width, height, frame_count, fps):
    scene = bpy.data.scenes.new('Temporary H.264 encoding')
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    scene.frame_start = 1
    scene.frame_end = frame_count
    editor = scene.sequence_editor_create()
    strip = editor.strips.new_image('Rendered frames', str(frame_directory / 'frame_0001.png'), channel=1, frame_start=1)
    for frame in range(2, frame_count + 1):
        strip.elements.append(f'frame_{frame:04d}.png')
    strip.frame_final_duration = frame_count
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.media_type = 'VIDEO'
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'HIGH'
    scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
    scene.render.ffmpeg.audio_codec = 'NONE'
    scene.render.filepath = str(output)
    bpy.context.window.scene = scene
    bpy.ops.render.render(animation=True, scene=scene.name)
    print('VIDEO READY:', output, flush=True)


def main():
    settings = arguments()
    scene = bpy.context.scene
    width, height, samples = (1920, 1080, 128) if settings.quality == 'final' else (1280, 720, 64)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = samples
    scene.render.image_settings.media_type = 'IMAGE'
    scene.render.image_settings.file_format = 'PNG'
    frame_count = scene.frame_end
    frame_directory = DIRECTORY / ('frames_final' if settings.quality == 'final' else 'frames')
    frame_directory.mkdir(exist_ok=True)
    signature = hashlib.sha256(Path(bpy.data.filepath).read_bytes() + f'{width}:{height}:{samples}'.encode()).hexdigest()
    manifest_file = frame_directory / 'render_manifest.json'
    manifest = {'signature': signature, 'completed': []}
    if manifest_file.exists():
        previous = json.loads(manifest_file.read_text(encoding='utf-8'))
        if previous.get('signature') == signature:
            manifest = previous
    completed = set(manifest['completed'])
    if settings.encode_only and len(completed) != frame_count:
        raise RuntimeError('The current scene has not been fully rendered. Run without --encode-only first.')
    selected = settings.frames or range(scene.frame_start, scene.frame_end + 1)
    if not settings.encode_only:
        for frame in selected:
            destination = frame_directory / f'frame_{frame:04d}.png'
            if frame in completed and destination.exists() and destination.stat().st_size > 100:
                print('RESUME: already rendered', frame, flush=True)
                continue
            scene.frame_set(frame)
            scene.render.filepath = str(destination)
            bpy.ops.render.render(write_still=True)
            completed.add(frame)
            manifest['completed'] = sorted(completed)
            temporary_manifest = manifest_file.with_suffix('.tmp')
            temporary_manifest.write_text(json.dumps(manifest), encoding='utf-8')
            temporary_manifest.replace(manifest_file)
            print('FRAME COMPLETE:', frame, flush=True)
    if settings.frames:
        return
    missing = [frame for frame in range(1, frame_count + 1) if not (frame_directory / f'frame_{frame:04d}.png').exists()]
    if missing:
        raise RuntimeError(f'Cannot encode: {len(missing)} frames are missing.')
    output = DIRECTORY / ('landing_page_logo_1080p.mp4' if settings.quality == 'final' else 'landing_page_logo_preview.mp4')
    encode(frame_directory, output, width, height, frame_count, scene.render.fps)
    if settings.quality == 'preview':
        storyboard = DIRECTORY / 'storyboard'
        storyboard.mkdir(exist_ok=True)
        for frame in scene.get('storyboard_frames', [scene.frame_start, frame_count]):
            filename = f'frame_{frame:04d}.png'
            shutil.copyfile(frame_directory / filename, storyboard / filename)


if __name__ == '__main__':
    main()
