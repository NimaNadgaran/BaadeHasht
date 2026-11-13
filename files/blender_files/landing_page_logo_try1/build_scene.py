import argparse
import bisect
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector


DIRECTORY = Path(__file__).resolve().parent
ASSETS = DIRECTORY.parents[1]
BLEND_FILE = DIRECTORY / 'landing_page_logo_try1.blend'
LOGO_HEIGHT = 9.4
FPS = 24
FRAME_COUNT = 144
PATH_END_FRAME = 61
TAKEOFF_END_FRAME = 71
ROTATION_END_FRAME = 79
SWEEP_START_FRAME = 84
SWEEP_END_FRAME = 132
STORYBOARD_FRAMES = (1, 15, 30, 46, 61, 71, 75, 79, 96, 108, 120, 132, 144)


def options():
    parser = argparse.ArgumentParser()
    parser.add_argument('--storyboard', action='store_true')
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(arguments)


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to(object_data, destination):
    for current in list(object_data.users_collection):
        current.objects.unlink(object_data)
    destination.objects.link(object_data)
    return object_data


def simplify(points, tolerance):
    if len(points) < 3:
        return points
    start = np.array(points[0], dtype=float)
    end = np.array(points[-1], dtype=float)
    coordinates = np.array(points, dtype=float)
    direction = end - start
    magnitude = np.linalg.norm(direction)
    if magnitude < 0.00001:
        distances = np.linalg.norm(coordinates - start, axis=1)
    else:
        relative = coordinates - start
        distances = np.abs(direction[0] * relative[:, 1] - direction[1] * relative[:, 0]) / magnitude
    pivot = int(np.argmax(distances))
    if distances[pivot] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:pivot + 1], tolerance)[:-1] + simplify(points[pivot:], tolerance)


def trace_boundaries(mask, minimum_area=15):
    padded = np.pad(mask, 1)
    boundaries = {}
    neighbors = [
        (padded[:-2, 1:-1], (0, 0), (1, 0)),
        (padded[1:-1, 2:], (1, 0), (1, 1)),
        (padded[2:, 1:-1], (1, 1), (0, 1)),
        (padded[1:-1, :-2], (0, 1), (0, 0)),
    ]
    for neighbor, start_offset, end_offset in neighbors:
        rows, columns = np.where(mask & ~neighbor)
        for row, column in zip(rows.tolist(), columns.tolist()):
            start = (column + start_offset[0], row + start_offset[1])
            end = (column + end_offset[0], row + end_offset[1])
            boundaries.setdefault(start, []).append(end)

    polygons = []
    while boundaries:
        start = next(iter(boundaries))
        current = start
        points = []
        while True:
            points.append(current)
            candidates = boundaries[current]
            if len(candidates) > 1 and len(points) > 1:
                incoming = (current[0] - points[-2][0], current[1] - points[-2][1])
                candidates.sort(key=lambda point: math.atan2(
                    incoming[0] * (point[1] - current[1]) - incoming[1] * (point[0] - current[0]),
                    incoming[0] * (point[0] - current[0]) + incoming[1] * (point[1] - current[1]),
                ))
            following = candidates.pop()
            if not candidates:
                del boundaries[current]
            current = following
            if current == start:
                break
        area = sum(
            points[index][0] * points[(index + 1) % len(points)][1]
            - points[(index + 1) % len(points)][0] * points[index][1]
            for index in range(len(points))
        ) / 2
        if abs(area) >= minimum_area:
            middle = len(points) // 2
            simplified = simplify(points[:middle + 1], 1.1)[:-1]
            simplified += simplify(points[middle:] + [points[0]], 1.1)[:-1]
            if len(simplified) >= 3:
                for iteration in range(2):
                    smoothed = []
                    for index, point in enumerate(simplified):
                        following = simplified[(index + 1) % len(simplified)]
                        smoothed.append((point[0] * 0.75 + following[0] * 0.25, point[1] * 0.75 + following[1] * 0.25))
                        smoothed.append((point[0] * 0.25 + following[0] * 0.75, point[1] * 0.25 + following[1] * 0.75))
                    simplified = smoothed
                polygons.append(simplified)
    return polygons


def source_image(filename, step, wordmark=False):
    image = bpy.data.images.load(str(ASSETS / 'images' / filename), check_existing=True)
    image.colorspace_settings.name = 'Non-Color'
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)[::step, ::step, :3]
    if wordmark:
        mask = (pixels[:, :, 0] > 0.57) & (pixels[:, :, 1] > 0.40) & (pixels[:, :, 2] > 0.68)
    else:
        mask = np.max(pixels, axis=2) > 0.235
    polygons = trace_boundaries(mask, minimum_area=20 if wordmark else 12)
    image.colorspace_settings.name = 'sRGB'
    return image, polygons, width, height


def metallic_material(name, color, metallic=0.6, roughness=0.25):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Coat Weight'].default_value = 0.35
    return material


def emission_material(name, color, strength):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (*color, 1)
    emission.inputs['Strength'].default_value = strength
    material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    return material, emission.inputs['Strength']


def filled_curve(name, polygons, mapping, depth, bevel, destination):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.fill_mode = 'BOTH'
    curve.resolution_u = 2
    curve.extrude = depth
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    for polygon in polygons:
        spline = curve.splines.new('POLY')
        spline.points.add(len(polygon) - 1)
        for vertex, point in zip(spline.points, polygon):
            horizontal, vertical = mapping(point)
            vertex.co = (horizontal, vertical, 0, 1)
        spline.use_cyclic_u = True
    object_data = bpy.data.objects.new(name, curve)
    destination.objects.link(object_data)
    return object_data


def export_svg(polygons, width, height, filename):
    paths = []
    for polygon in polygons:
        coordinates = ['{:.2f},{:.2f}'.format(point[0], height - point[1]) for point in polygon]
        paths.append('M' + ' L'.join(coordinates) + ' Z')
    document = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}"><path fill="#9136db" fill-rule="nonzero" d="{}"/></svg>'.format(width, height, ' '.join(paths))
    (DIRECTORY / filename).write_text(document, encoding='utf-8')


def make_logo(destination):
    image, polygons, width, height = source_image('BlackTBack.png', 3)
    logo_width = LOGO_HEIGHT * width / height
    mapping = lambda point: ((point[0] * 3 / width - 0.5) * logo_width, (point[1] * 3 / height - 0.5) * LOGO_HEIGHT)
    logo = filled_curve('Logo | traced silhouette, holes and road details', polygons, mapping, 0.15, 0.026, destination)
    surface = metallic_material('Smoked violet metal | original UV-mapped face', (0.35, 0.02, 0.7), 0.65, 0.23)
    nodes = surface.node_tree.nodes
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.label = 'The supplied original logo, not an AI approximation'
    coordinates = nodes.new('ShaderNodeUVMap')
    coordinates.uv_map = 'Original logo coordinates'
    surface.node_tree.links.new(coordinates.outputs['UV'], texture.inputs['Vector'])
    shader = nodes.get('Principled BSDF')
    shader.inputs['Coat Weight'].default_value = 0.32
    shader.inputs['Coat Roughness'].default_value = 0.16
    shader.inputs['Specular IOR Level'].default_value = 0.5
    tint = nodes.new('ShaderNodeHueSaturation')
    tint.inputs['Saturation'].default_value = 0.52
    tint.inputs['Value'].default_value = 0.7
    surface.node_tree.links.new(texture.outputs['Color'], tint.inputs['Color'])
    surface.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    surface.node_tree.links.new(tint.outputs['Color'], shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = 0.045
    edge = metallic_material('Satin violet | beveled metal edges', (0.09, 0.045, 0.15), 0.72, 0.24)
    logo.data.materials.append(surface)
    logo.data.materials.append(edge)
    bpy.context.view_layer.objects.active = logo
    logo.select_set(True)
    bpy.ops.object.convert(target='MESH')
    logo = bpy.context.object
    uv_layer = logo.data.uv_layers.new(name='Original logo coordinates')
    for face in logo.data.polygons:
        face.material_index = 0 if face.normal.z > 0.99 else 1
        face.use_smooth = abs(face.normal.z) < 0.99
        for loop_index in face.loop_indices:
            vertex = logo.data.vertices[logo.data.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (vertex.co.x / logo_width + 0.5, vertex.co.y / LOGO_HEIGHT + 0.5)
    logo.select_set(False)
    logo['source'] = 'BlackTBack.png, threshold-traced into real geometry'
    logo['design_note'] = 'Preserves the supplied play icon, road dashes and location pin.'
    export_svg(polygons, math.ceil(width / 3), math.ceil(height / 3), 'logo_trace.svg')
    print('LOGO TRACE:', len(polygons), 'contours;', len(logo.data.vertices), 'mesh vertices', flush=True)
    return logo


def make_wordmark(destination):
    image, polygons, width, height = source_image('BlackTFront.png', 2, wordmark=True)
    all_points = np.array([point for polygon in polygons for point in polygon])
    lower = all_points.min(axis=0)
    upper = all_points.max(axis=0)
    center = (lower + upper) / 2
    scale = 4.0 / (upper[0] - lower[0])
    mapping = lambda point: ((point[0] - center[0]) * scale, (point[1] - center[1]) * scale)
    wordmark = filled_curve('بعد هشت | original Persian wordmark', polygons, mapping, 0.008, 0.004, destination)
    wordmark.location = (0, -5.4, 0.02)
    material, strength = emission_material('Wordmark | soft lavender reveal', (0.61, 0.49, 0.8), 0)
    wordmark.data.materials.append(material)
    for frame, value in [(1, 0), (75, 0), (83, 0.55), (FRAME_COUNT, 0.55)]:
        strength.default_value = value
        strength.keyframe_insert('default_value', frame=frame)
    for frame, hidden in [(1, True), (74, True), (75, False), (FRAME_COUNT, False)]:
        wordmark.hide_render = hidden
        wordmark.keyframe_insert('hide_render', frame=frame)
    print('WORDMARK TRACE:', len(polygons), 'contours', flush=True)
    return wordmark


def catmull_rom(points, progress):
    progress = max(0, min(1, progress)) * (len(points) - 1)
    index = min(int(progress), len(points) - 2)
    fraction = progress - index
    previous = points[max(0, index - 1)]
    start = points[index]
    end = points[index + 1]
    following = points[min(len(points) - 1, index + 2)]
    return 0.5 * ((2 * start) + (-previous + end) * fraction + (2 * previous - 5 * start + 4 * end - following) * fraction ** 2 + (-previous + 3 * start - 3 * end + following) * fraction ** 3)


def smoothstep(progress):
    return progress ** 3 * (progress * (progress * 6 - 15) + 10)


def measured_route(points):
    samples = [catmull_rom(points, index / 2400) for index in range(2401)]
    distances = [0.0]
    for previous, following in zip(samples, samples[1:]):
        distances.append(distances[-1] + (following - previous).length)
    return samples, distances


def route_sample(route, progress):
    samples, distances = route
    distance = max(0, min(1, progress)) * distances[-1]
    index = max(1, bisect.bisect_left(distances, distance))
    fraction = (distance - distances[index - 1]) / (distances[index] - distances[index - 1])
    return samples[index - 1].lerp(samples[index], fraction)


def road_camera_pose(route, progress):
    surface = route_sample(route, progress)
    position = surface + Vector((0, 0, 0.42))
    length = route[1][-1]
    ahead = min(1, progress + 0.65 / length)
    behind = max(0, progress - 0.15 / length)
    direction = (route_sample(route, ahead) - route_sample(route, behind)).normalized()
    target = position + direction * 2.4
    target.z = position.z - 2.4 * math.tan(math.radians(11))
    return position, target


def route_points(logo):
    reference_points = [(203, 326), (224, 329), (248, 326), (267, 315), (278, 297), (282, 276), (278, 256), (264, 241), (244, 226), (221, 209), (202, 195), (185, 177), (175, 159), (172, 140), (176, 120), (185, 105), (202, 98), (221, 96), (239, 102), (253, 115), (260, 132), (256, 153), (247, 169), (239, 179), (220, 187), (204, 199), (188, 215), (175, 232), (166, 252), (163, 273), (170, 289), (183, 299), (198, 302), (214, 296), (227, 285), (239, 274)]
    horizontal_min = min(vertex.co.x for vertex in logo.data.vertices)
    horizontal_max = max(vertex.co.x for vertex in logo.data.vertices)
    vertical_min = min(vertex.co.y for vertex in logo.data.vertices)
    vertical_max = max(vertex.co.y for vertex in logo.data.vertices)
    return [Vector((horizontal_min + (horizontal - 129) / 178 * (horizontal_max - horizontal_min), vertical_max - (vertical - 55) / 291 * (vertical_max - vertical_min), 0.2)) for horizontal, vertical in reference_points]


def light(name, position, color, energy, size, destination):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size
    object_data = bpy.data.objects.new(name, data)
    destination.objects.link(object_data)
    object_data.location = position
    object_data.rotation_euler = (Vector((0, 0, 0)) - object_data.location).to_track_quat('-Z', 'Y').to_euler()
    return object_data


def make_stage(destination):
    floor_material = metallic_material('Graphite | micro-textured architectural satin', (0.035, 0.038, 0.046), 0.12, 0.78)
    floor_shader = floor_material.node_tree.nodes.get('Principled BSDF')
    floor_shader.inputs['Specular IOR Level'].default_value = 0.12
    floor_shader.inputs['Coat Weight'].default_value = 0
    floor_nodes = floor_material.node_tree.nodes
    floor_links = floor_material.node_tree.links
    coordinates = floor_nodes.new('ShaderNodeNewGeometry')
    clouds = floor_nodes.new('ShaderNodeTexNoise')
    clouds.inputs['Scale'].default_value = 0.24
    clouds.inputs['Detail'].default_value = 2
    shades = floor_nodes.new('ShaderNodeValToRGB')
    shades.color_ramp.elements[0].color = (0.024, 0.026, 0.032, 1)
    shades.color_ramp.elements[1].color = (0.041, 0.043, 0.051, 1)
    floor_links.new(coordinates.outputs['Position'], clouds.inputs['Vector'])
    floor_links.new(clouds.outputs['Fac'], shades.inputs['Fac'])
    floor_links.new(shades.outputs['Color'], floor_shader.inputs['Base Color'])
    grain = floor_nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 170
    grain.inputs['Detail'].default_value = 2
    bump = floor_nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.16
    bump.inputs['Distance'].default_value = 0.012
    floor_links.new(coordinates.outputs['Position'], grain.inputs['Vector'])
    floor_links.new(grain.outputs['Fac'], bump.inputs['Height'])
    floor_links.new(bump.outputs['Normal'], floor_shader.inputs['Normal'])
    pool_scale = floor_nodes.new('ShaderNodeVectorMath')
    pool_scale.operation = 'MULTIPLY'
    pool_scale.inputs[1].default_value = (0.075, 0.11, 0)
    pool_radius = floor_nodes.new('ShaderNodeVectorMath')
    pool_radius.operation = 'LENGTH'
    pool = floor_nodes.new('ShaderNodeValToRGB')
    pool.color_ramp.elements[0].color = (0.018, 0.019, 0.024, 1)
    pool.color_ramp.elements[1].color = (0.0015, 0.0017, 0.0023, 1)
    pool.color_ramp.interpolation = 'EASE'
    floor_links.new(coordinates.outputs['Position'], pool_scale.inputs[0])
    floor_links.new(pool_scale.outputs['Vector'], pool_radius.inputs[0])
    floor_links.new(pool_radius.outputs['Value'], pool.inputs['Fac'])
    floor_links.new(pool.outputs['Color'], floor_shader.inputs['Emission Color'])
    floor_shader.inputs['Emission Strength'].default_value = 1
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.22))
    floor = move_to(bpy.context.object, destination)
    floor.name = 'Infinite midnight studio'
    floor.data.materials.append(floor_material)
    backdrop_material = floor_material.copy()
    backdrop_material.name = 'Graphite | seamless curved studio sweep'
    backdrop_nodes = backdrop_material.node_tree.nodes
    backdrop_links = backdrop_material.node_tree.links
    backdrop_surface = backdrop_nodes.get('Principled BSDF')
    backdrop_coordinates = backdrop_nodes.new('ShaderNodeNewGeometry')
    backdrop_clouds = backdrop_nodes.new('ShaderNodeTexNoise')
    backdrop_clouds.inputs['Scale'].default_value = 0.11
    backdrop_clouds.inputs['Detail'].default_value = 2
    backdrop_shades = backdrop_nodes.new('ShaderNodeValToRGB')
    backdrop_shades.color_ramp.elements[0].position = 0.2
    backdrop_shades.color_ramp.elements[0].color = (0.009, 0.010, 0.014, 1)
    backdrop_shades.color_ramp.elements[1].position = 0.8
    backdrop_shades.color_ramp.elements[1].color = (0.020, 0.022, 0.029, 1)
    backdrop_emission = backdrop_nodes.new('ShaderNodeEmission')
    backdrop_emission.inputs['Strength'].default_value = 0.38
    backdrop_height = backdrop_nodes.new('ShaderNodeSeparateXYZ')
    backdrop_fade = backdrop_nodes.new('ShaderNodeMapRange')
    backdrop_fade.interpolation_type = 'SMOOTHSTEP'
    backdrop_fade.inputs['From Min'].default_value = 0
    backdrop_fade.inputs['From Max'].default_value = 5
    backdrop_mix = backdrop_nodes.new('ShaderNodeMixShader')
    backdrop_output = backdrop_nodes.get('Material Output')
    backdrop_links.new(backdrop_coordinates.outputs['Position'], backdrop_clouds.inputs['Vector'])
    backdrop_links.new(backdrop_clouds.outputs['Fac'], backdrop_shades.inputs['Fac'])
    backdrop_links.new(backdrop_shades.outputs['Color'], backdrop_emission.inputs['Color'])
    backdrop_links.new(backdrop_coordinates.outputs['Position'], backdrop_height.inputs['Vector'])
    backdrop_links.new(backdrop_height.outputs['Z'], backdrop_fade.inputs['Value'])
    backdrop_links.new(backdrop_fade.outputs['Result'], backdrop_mix.inputs[0])
    backdrop_links.new(backdrop_surface.outputs['BSDF'], backdrop_mix.inputs[1])
    backdrop_links.new(backdrop_emission.outputs['Emission'], backdrop_mix.inputs[2])
    backdrop_links.new(backdrop_mix.outputs['Shader'], backdrop_output.inputs['Surface'])
    profile = [(18, -0.23), (21, -0.18), (24, 0.2), (27, 1), (29, 3), (30, 7), (30, 80)]
    segments = 192
    vertices = []
    faces = []
    for radius, height in profile:
        for segment in range(segments):
            angle = 2 * math.pi * segment / segments
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), height))
    for level in range(len(profile) - 1):
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((level * segments + segment, level * segments + following, (level + 1) * segments + following, (level + 1) * segments + segment))
    backdrop_mesh = bpy.data.meshes.new('Seamless surrounding backdrop | curved profile')
    backdrop_mesh.from_pydata(vertices, [], faces)
    backdrop_mesh.materials.append(backdrop_material)
    backdrop = bpy.data.objects.new('Dark atmospheric backdrop | surrounds the entire journey', backdrop_mesh)
    destination.objects.link(backdrop)
    for polygon in backdrop_mesh.polygons:
        polygon.use_smooth = True
    for name, position, color, power, size in [
        ('Key | dim silk softbox', (-4, -2, 7), (0.84, 0.87, 1), 320, 8),
        ('Rim | desaturated silver', (5, 4, 5), (0.72, 0.8, 1), 220, 6),
        ('Fill | quiet pearl', (0, -6, 9), (1, 0.94, 0.88), 200, 7),
    ]:
        softbox = light(name, position, color, power, size, destination)
        for frame, multiplier in [(1, 0.55), (TAKEOFF_END_FRAME, 0.55), (SWEEP_START_FRAME, 1), (FRAME_COUNT, 1)]:
            softbox.data.energy = power * multiplier
            softbox.data.keyframe_insert('energy', frame=frame)
    sun = light('Sun sweep | left to right polished reflection', (-16, 0, 6), (1, 0.91, 0.78), 0, 3.8, destination)
    sun['direction'] = 'One left-to-right arc after the overhead reveal; stops off-axis after its reflection clears the logo.'
    for frame in range(1, FRAME_COUNT + 1):
        progress = max(0, min(1, (frame - SWEEP_START_FRAME) / (SWEEP_END_FRAME - SWEEP_START_FRAME)))
        angle = math.radians(-76 + 152 * smoothstep(progress))
        sun.location = (16 * math.sin(angle), 0.8, 16 * math.cos(angle))
        sun.rotation_euler = (-sun.location).to_track_quat('-Z', 'Y').to_euler()
        sun.keyframe_insert('location', frame=frame, group='Single sunlight pass')
        sun.keyframe_insert('rotation_euler', frame=frame, group='Single sunlight pass')
    for frame, power in [(1, 0), (SWEEP_START_FRAME, 0), (90, 2800), (126, 2800), (SWEEP_END_FRAME, 0), (FRAME_COUNT, 0)]:
        sun.data.energy = power
        sun.data.keyframe_insert('energy', frame=frame)
    world = bpy.data.worlds.new('Midnight atmosphere')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.038, 0.05, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.12
    bpy.context.scene.world = world


def make_camera(destination, guide_collection, logo):
    points = route_points(logo)
    route = measured_route(points)
    curve = bpy.data.curves.new('Journey along the eight | editable centerline', 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(200)
    for index, point in enumerate(spline.points):
        sample = route_sample(route, index / 200)
        point.co = (*sample, 1)
    guide = bpy.data.objects.new('Camera route | hidden from renders', curve)
    guide_collection.objects.link(guide)
    guide.hide_render = True
    guide.display_type = 'WIRE'
    guide['reference'] = 'according_image.png: bottom curve, diagonal crossover, clockwise upper loop, lower-left loop, end at the lower-right arrow.'
    guide['length'] = route[1][-1]

    camera_data = bpy.data.cameras.new('Journey camera | 28–36 mm')
    camera = bpy.data.objects.new('CAMERA | surface journey → rising reveal', camera_data)
    destination.objects.link(camera)
    camera.rotation_mode = 'QUATERNION'
    camera_data.clip_start = 0.04
    camera_data.clip_end = 250
    camera_data.lens = 28
    bpy.context.scene.camera = camera

    final_target = Vector((0, -0.5, 0))
    end_position, end_target = road_camera_pose(route, 1)
    final_position = Vector((end_position.x, end_position.y, 25.5))
    launch_rotation = (end_target - end_position).to_track_quat('-Z', 'Y')
    final_forward = (final_target - final_position).normalized()
    final_right = final_forward.cross(Vector((0, 1, 0))).normalized()
    final_up = final_right.cross(final_forward).normalized()
    final_rotation = Matrix((final_right, final_up, -final_forward)).transposed().to_quaternion()

    pulse_material, pulse_strength = emission_material('Leading light | muted pearl', (0.55, 0.5, 0.65), 0.65)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.018)
    pulse = move_to(bpy.context.object, destination)
    pulse.name = 'Leading light | travels ahead of the camera'
    pulse.data.materials.append(pulse_material)

    for frame in range(1, FRAME_COUNT + 1):
        progress = min(1, (frame - 1) / (PATH_END_FRAME - 1))
        if frame <= PATH_END_FRAME:
            camera.location, target = road_camera_pose(route, progress)
            rotation = (target - camera.location).to_track_quat('-Z', 'Y')
            camera_data.lens = 28
        elif frame <= TAKEOFF_END_FRAME:
            lift = smoothstep((frame - PATH_END_FRAME) / (TAKEOFF_END_FRAME - PATH_END_FRAME))
            camera.location = end_position.lerp(final_position, lift)
            rotation = launch_rotation.copy()
            camera_data.lens = 28
        else:
            blend = smoothstep(min(1, (frame - TAKEOFF_END_FRAME) / (ROTATION_END_FRAME - TAKEOFF_END_FRAME)))
            camera.location = final_position
            rotation = launch_rotation.slerp(final_rotation, blend)
            camera_data.lens = 28 + 8 * blend
        if frame > 1:
            rotation.make_compatible(camera.rotation_quaternion)
        rotation.normalize()
        camera.rotation_quaternion = rotation
        camera.keyframe_insert('location', frame=frame, group='Camera journey')
        camera.keyframe_insert('rotation_quaternion', frame=frame, group='Camera journey')
        camera_data.keyframe_insert('lens', frame=frame)
        pulse.location = route_sample(route, min(1, progress + 1.2 / route[1][-1])) + Vector((0, 0, 0.04))
        pulse.keyframe_insert('location', frame=frame)
    for frame, value in [(1, 0.65), (PATH_END_FRAME, 0.65), (66, 0), (FRAME_COUNT, 0)]:
        pulse_strength.default_value = value
        pulse_strength.keyframe_insert('default_value', frame=frame)
    for frame, hidden in [(1, False), (66, False), (67, True), (FRAME_COUNT, True)]:
        pulse.hide_render = hidden
        pulse.keyframe_insert('hide_render', frame=frame)
    return camera


def compositor(scene):
    group = bpy.data.node_groups.new('Cinematic finish | restrained highlight bloom', 'CompositorNodeTree')
    group.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    layers = group.nodes.new('CompositorNodeRLayers')
    layers.location = (-300, 0)
    glare = group.nodes.new('CompositorNodeGlare')
    glare.location = (-70, 0)
    glare.inputs['Type'].default_value = 'Fog Glow'
    glare.inputs['Quality'].default_value = 'Medium'
    glare.inputs['Threshold'].default_value = 1.4
    glare.inputs['Strength'].default_value = 0.12
    output = group.nodes.new('NodeGroupOutput')
    output.location = (200, 0)
    group.links.new(layers.outputs['Image'], glare.inputs['Image'])
    group.links.new(glare.outputs['Image'], output.inputs['Image'])
    scene.compositing_node_group = group


def configure_scene(scene):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = FRAME_COUNT
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -0.35
    scene.render.film_transparent = False
    scene.render.filepath = str(DIRECTORY / 'frames' / 'frame_')
    for frame, name in [(1, '01 | Bottom curve start'), (15, '02 | Race up the crossover'), (30, '03 | Clockwise upper loop'), (46, '04 | Sweep the lower loop'), (PATH_END_FRAME, '05 | Endpoint - vertical takeoff'), (TAKEOFF_END_FRAME, '06 | Snap rotation begins'), (ROTATION_END_FRAME, '07 | Full logo - hold')]:
        scene.timeline_markers.new(name, frame=frame)
    scene.timeline_markers.new('08 | Sunlight travels left to right', frame=SWEEP_START_FRAME)
    scene.timeline_markers.new('09 | Reflection clears - settle and end', frame=SWEEP_END_FRAME)
    scene['shot_description'] = '6 seconds / 24 fps. Original route, vertical launch and snap rotation retained. Dim, desaturated journey in a graphite satin studio. One warm sunlight reflection crosses the polished logo after the overhead reveal, clears to the right, stops, and holds.'
    scene['storyboard_frames'] = list(STORYBOARD_FRAMES)
    scene['path_end_frame'] = PATH_END_FRAME
    scene['takeoff_end_frame'] = TAKEOFF_END_FRAME
    scene['rotation_end_frame'] = ROTATION_END_FRAME
    scene['sweep_start_frame'] = SWEEP_START_FRAME
    scene['sweep_end_frame'] = SWEEP_END_FRAME
    scene['render_note'] = 'Use render_scene.py for resumable PNG frames and H.264 encoding. Original images are packed.'


def main():
    arguments = options()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.preferences.filepaths.file_preview_type = 'NONE'
    for existing in list(bpy.data.collections):
        if existing.name == 'Collection':
            bpy.data.collections.remove(existing)
    scene = bpy.context.scene
    scene.name = 'BaadeHasht | cinematic logo journey | try 01'
    logo_collection = collection('01 · Original logo — real beveled geometry')
    wordmark_collection = collection('02 · Persian wordmark — reveal')
    camera_collection = collection('03 · Animated camera and leading light')
    stage_collection = collection('04 · Midnight studio and lighting')
    guides = collection('05 · Editable route guide — not rendered')
    configure_scene(scene)
    logo = make_logo(logo_collection)
    make_wordmark(wordmark_collection)
    make_stage(stage_collection)
    camera = make_camera(camera_collection, guides, logo)
    compositor(scene)
    scene.frame_set(FRAME_COUNT)
    bpy.ops.object.select_all(action='DESELECT')
    camera.select_set(True)
    bpy.context.view_layer.objects.active = camera
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
                area.spaces.active.overlay.show_overlays = False
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_FILE))
    metadata = {'blender': bpy.app.version_string, 'fps': FPS, 'frames': FRAME_COUNT, 'duration_seconds': FRAME_COUNT / FPS, 'preview_resolution': [1280, 720], 'source_logo': 'files/images/BlackTBack.png', 'source_wordmark': 'files/images/BlackTFront.png', 'packed_textures': True, 'road_camera_pitch_degrees': 11, 'backdrop': 'Seamless graphite cyclorama, fine satin grain and elliptical studio falloff', 'route_reference': 'according_image.png', 'path_end_frame': PATH_END_FRAME, 'takeoff_end_frame': TAKEOFF_END_FRAME, 'rotation_end_frame': ROTATION_END_FRAME, 'sweep_start_frame': SWEEP_START_FRAME, 'sweep_end_frame': SWEEP_END_FRAME, 'sweep_direction': 'left to right, single pass, stops off-axis', 'storyboard_frames': list(STORYBOARD_FRAMES)}
    (DIRECTORY / 'scene_info.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    if arguments.storyboard:
        storyboard = DIRECTORY / 'storyboard'
        storyboard.mkdir(exist_ok=True)
        for frame in STORYBOARD_FRAMES:
            scene.frame_set(frame)
            scene.render.filepath = str(storyboard / f'frame_{frame:04d}.png')
            bpy.ops.render.render(write_still=True)
    print('SCENE READY:', BLEND_FILE, flush=True)


if __name__ == '__main__':
    main()
