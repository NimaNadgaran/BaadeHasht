import hashlib
import json
from pathlib import Path

import bpy


DIRECTORY = Path(__file__).resolve().parent
VARIANTS = {
    'dark': ('landing_page_logo_try1', 'landing_page_logo_try1.blend'),
    'light': ('landing_page_logo_try2_vivid', 'landing_page_logo_try2_vivid.blend'),
}


def camera_snapshot(scene):
    result = []
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        result.append((*scene.camera.location, *scene.camera.rotation_quaternion, scene.camera.data.lens))
    return result


def build_variant(variant, source_folder, source_filename):
    source_directory = DIRECTORY / source_folder
    source_file = source_directory / source_filename
    source_hash = hashlib.sha256(source_file.read_bytes()).hexdigest()
    name = f'landingpage_logo_{variant}'
    destination = DIRECTORY / name
    destination.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source_file))
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    original_camera = camera_snapshot(scene)
    ball = bpy.data.objects.get('Leading light | travels ahead of the camera')
    if ball is None:
        raise RuntimeError(f'The expected leading ball was not found in {source_file}.')
    ball_mesh = ball.data
    ball_materials = list(ball_mesh.materials)
    bpy.data.objects.remove(ball, do_unlink=True)
    if ball_mesh.users == 0:
        bpy.data.meshes.remove(ball_mesh)
    for material in ball_materials:
        if material.users == 0:
            bpy.data.materials.remove(material)
    if camera_snapshot(scene) != original_camera:
        raise RuntimeError('Removing the ball must not change the camera motion.')
    if any('Leading light' in object_data.name for object_data in scene.objects):
        raise RuntimeError('A leading ball remains in the scene.')
    scene.name = name
    scene['leading_ball_removed'] = True
    scene['shot_description'] = scene['shot_description'] + ' Leading ball removed; camera movement and all studio/sunlight lighting preserved.'
    scene['source_scene_sha256'] = source_hash
    scene.render.filepath = str(destination / 'frames' / 'frame_')
    scene.frame_set(scene.frame_end)
    bpy.ops.object.select_all(action='DESELECT')
    scene.camera.select_set(True)
    bpy.context.view_layer.objects.active = scene.camera
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(destination / f'{name}.blend'))
    metadata = json.loads((source_directory / 'scene_info.json').read_text(encoding='utf-8'))
    metadata.update({
        'name': name,
        'variant': variant,
        'leading_ball_removed': True,
        'camera_motion_preserved': True,
        'source_scene': f'../{source_folder}/{source_filename}',
        'source_scene_sha256': source_hash,
    })
    (destination / 'scene_info.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    preview = (source_directory / 'preview.html').read_text(encoding='utf-8')
    preview = preview.replace(source_filename, f'{name}.blend')
    preview = preview.replace('landing_page_logo_preview.mp4', f'{name}_preview.mp4')
    preview = preview.replace('landing_page_logo_1080p.mp4', f'{name}_1080p.mp4')
    preview = preview.replace('href="according_image.png"', 'href="../landing_page_logo_try1/according_image.png"')
    preview = preview.replace('../landing_page_logo_try1/preview.html', '../landingpage_logo_dark/preview.html')
    preview = preview.replace('Compare the original graphite version', 'Compare the dark version')
    preview = preview.replace('Original graphite edition', 'Dark version without the ball')
    preview = preview.replace('which remains unchanged.', 'also with the leading ball removed.')
    preview = preview.replace('Original website files remain unchanged.', '<a href="../landingpage_logo_light/preview.html">Light version without the ball</a> · Original versions remain unchanged.')
    preview = preview.replace('Select a storyboard image', 'The small leading ball is removed; camera movement is unchanged. Select a storyboard image')
    preview = preview.replace('Logo Journey / Try 01', 'Logo Journey / Dark / No Ball')
    preview = preview.replace('Logo Journey / Vivid Edition', 'Logo Journey / Light / No Ball')
    (destination / 'preview.html').write_text(preview, encoding='utf-8')
    if hashlib.sha256(source_file.read_bytes()).hexdigest() != source_hash:
        raise RuntimeError('The source scene was unexpectedly modified.')
    print(f'PASS: {name}: ball removed, all 144 camera poses preserved, original untouched.', flush=True)


def main():
    for variant, (source_folder, source_filename) in VARIANTS.items():
        build_variant(variant, source_folder, source_filename)


if __name__ == '__main__':
    main()
