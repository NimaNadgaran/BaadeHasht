param(
    [switch]$Render,
    [switch]$Final,
    [switch]$Storyboard,
    [string]$BlenderPath = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $BlenderPath)) {
    throw 'Blender was not found. Pass -BlenderPath with the path to blender.exe.'
}

$BuildArguments = @('--background', '--factory-startup', '--python-exit-code', '1', '--python', "$PSScriptRoot/build_scene.py")
if ($Storyboard) { $BuildArguments += @('--', '--storyboard') }
& $BlenderPath @BuildArguments
if ($LASTEXITCODE -ne 0) { throw 'Scene creation failed.' }

if ($Render -or $Final) {
    $Quality = if ($Final) { 'final' } else { 'preview' }
    & $BlenderPath --background "$PSScriptRoot/landing_page_logo_try1.blend" --python-exit-code 1 --python "$PSScriptRoot/render_scene.py" -- --quality $Quality
    if ($LASTEXITCODE -ne 0) { throw 'Rendering failed. Completed PNG frames are kept so rendering can resume.' }
}
