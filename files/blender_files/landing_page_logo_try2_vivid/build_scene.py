import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


DIRECTORY = Path(__file__).resolve().parent
SOURCE_DIRECTORY = DIRECTORY.parent / 'landing_page_logo_try1'
SOURCE_BLEND = SOURCE_DIRECTORY / 'landing_page_logo_try1.blend'
BLEND_FILE = DIRECTORY / 'landing_page_logo_try2_vivid.blend'


def motion_snapshot(scene):
    sun = bpy.data.objects['Sun sweep | left to right polished reflection']
    result = []
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        result.append((
            *scene.camera.location,
            *scene.camera.rotation_quaternion,
            scene.camera.data.lens,
            *sun.location,
            *sun.rotation_euler,
        ))
    return result


def set_ramp(material, node_name, start, end):
    ramp = material.node_tree.nodes[node_name].color_ramp
    ramp.elements[0].color = (*start, 1)
    ramp.elements[-1].color = (*end, 1)


def animate_power(light, power):
    for frame, multiplier in [(1, 0.7), (71, 0.7), (84, 1), (144, 1)]:
        light.data.energy = power * multiplier
        light.data.keyframe_insert('energy', frame=frame)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--storyboard', action='store_true')
    values = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    arguments = parser.parse_args(values)
    source_hash = hashlib.sha256(SOURCE_BLEND.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
    scene = bpy.context.scene
    original_motion = motion_snapshot(scene)
    bpy.context.preferences.filepaths.save_version = 0
    scene.name = 'BaadeHasht | vivid violet and cyan | try 02'

    surface = bpy.data.materials['Smoked violet metal | original UV-mapped face']
    surface.name = 'Vivid violet | polished original gradient'
    tint = next(node for node in surface.node_tree.nodes if node.bl_idname == 'ShaderNodeHueSaturation')
    tint.inputs['Saturation'].default_value = 1.12
    tint.inputs['Value'].default_value = 1
    shader = surface.node_tree.nodes['Principled BSDF']
    shader.inputs['Metallic'].default_value = 0.5
    shader.inputs['Roughness'].default_value = 0.24
    shader.inputs['Emission Strength'].default_value = 0.16
    edge = bpy.data.materials['Satin violet | beveled metal edges']
    edge.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.025, 0.42, 1)

    floor = bpy.data.materials['Graphite | micro-textured architectural satin']
    backdrop = bpy.data.materials['Graphite | seamless curved studio sweep']
    for material in (floor, backdrop):
        set_ramp(material, 'Color Ramp', (0.025, 0.035, 0.078), (0.07, 0.035, 0.11))
        set_ramp(material, 'Color Ramp.001', (0.032, 0.048, 0.095), (0.006, 0.009, 0.025))
    set_ramp(backdrop, 'Color Ramp.002', (0.025, 0.035, 0.09), (0.085, 0.03, 0.14))
    backdrop.node_tree.nodes['Emission'].inputs['Strength'].default_value = 0.65
    floor.name = 'Indigo satin | luminous violet-blue studio'
    backdrop.name = 'Indigo satin | seamless violet-blue cyclorama'

    for name, color, power in [
        ('Key | dim silk softbox', (0.78, 0.55, 1), 850),
        ('Rim | desaturated silver', (0.15, 0.68, 1), 780),
        ('Fill | quiet pearl', (1, 0.77, 0.6), 450),
    ]:
        softbox = bpy.data.objects[name]
        softbox.data.color = color
        animate_power(softbox, power)
    accent_data = bpy.data.lights.new('Accent | orchid silk', 'AREA')
    accent_data.shape = 'DISK'
    accent_data.size = 6
    accent_data.color = (1, 0.2, 0.58)
    accent = bpy.data.objects.new('Accent | orchid silk', accent_data)
    bpy.data.objects['Key | dim silk softbox'].users_collection[0].objects.link(accent)
    accent.location = (-5, 6, 4)
    accent.rotation_euler = (Vector((0, 0, 0)) - accent.location).to_track_quat('-Z', 'Y').to_euler()
    animate_power(accent, 420)

    sun = bpy.data.objects['Sun sweep | left to right polished reflection']
    sun.data.color = (1, 0.92, 0.79)
    for frame, power in [(1, 0), (84, 0), (90, 3000), (126, 3000), (132, 0), (144, 0)]:
        sun.data.energy = power
        sun.data.keyframe_insert('energy', frame=frame)
    world = scene.world.node_tree.nodes['Background']
    world.inputs['Color'].default_value = (0.075, 0.09, 0.18, 1)
    world.inputs['Strength'].default_value = 0.22
    wordmark = bpy.data.materials['Wordmark | soft lavender reveal'].node_tree.nodes['Emission']
    wordmark.inputs['Color'].default_value = (0.76, 0.65, 1, 1)
    for frame, strength in [(1, 0), (75, 0), (83, 0.8), (144, 0.8)]:
        wordmark.inputs['Strength'].default_value = strength
        wordmark.inputs['Strength'].keyframe_insert('default_value', frame=frame)
    scene.view_settings.exposure = 0.1
    scene.render.filepath = str(DIRECTORY / 'frames' / 'frame_')
    scene['shot_description'] = '6 seconds / 24 fps. Approved graphite animation preserved exactly: road journey, vertical launch, overhead reveal, one left-to-right sunlight reflection, stopped final hold. Brighter violet-blue satin studio, richer original logo colors, cyan and orchid accents.'
    scene['variant'] = 'Vivid violet / cyan / orchid'
    scene['source_scene_sha256'] = source_hash
    if motion_snapshot(scene) != original_motion:
        raise RuntimeError('The vivid treatment must not alter camera or sunlight motion.')
    scene.frame_set(144)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))
    metadata = json.loads((SOURCE_DIRECTORY / 'scene_info.json').read_text(encoding='utf-8'))
    metadata.update({
        'variant': scene['variant'],
        'backdrop': 'Violet-blue satin cyclorama, fine grain and luminous elliptical falloff',
        'source_scene': '../landing_page_logo_try1/landing_page_logo_try1.blend',
        'source_scene_sha256': source_hash,
        'motion_preserved': True,
        'final_resolution': [1920, 1080],
        'final_render_samples': 128,
    })
    (DIRECTORY / 'scene_info.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    if arguments.storyboard:
        storyboard = DIRECTORY / 'storyboard'
        storyboard.mkdir(exist_ok=True)
        for frame in metadata['storyboard_frames']:
            scene.frame_set(frame)
            scene.render.filepath = str(storyboard / f'frame_{frame:04d}.png')
            bpy.ops.render.render(write_still=True)
    print('PASS: camera and sunlight motion preserved on all 144 frames', flush=True)
    print('SCENE READY:', BLEND_FILE, flush=True)


if __name__ == '__main__':
    main()
