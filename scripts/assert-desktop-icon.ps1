#Requires -Version 7.0
# Check the actual PE resource, not merely a source PNG or favicon.
param(
  [Parameter(Mandatory = $true)][string]$Exe
)
$ErrorActionPreference = 'Stop'
$path = (Resolve-Path -LiteralPath $Exe).Path
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
if ($null -eq $icon) { throw "Windows binary has no embedded application icon: $path" }
try {
  $bitmap = $icon.ToBitmap()
  try {
    # The canonical square has a solid cobalt region above the fox silhouette.
    # Read the raster *extracted from the real Windows EXE resource*.
    $samples = @(
      @([int]($bitmap.Width * 0.5), [int]($bitmap.Height * 0.08)),
      @([int]($bitmap.Width * 0.5), [int]($bitmap.Height * 0.14)),
      @([int]($bitmap.Width * 0.90), [int]($bitmap.Height * 0.50))
    )
    $matched = $false
    foreach ($point in $samples) {
      $x = [Math]::Min($bitmap.Width - 1, $point[0])
      $y = [Math]::Min($bitmap.Height - 1, $point[1])
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.R -ge 28 -and $pixel.R -le 55 -and
          $pixel.G -ge 72 -and $pixel.G -le 112 -and
          $pixel.B -ge 180 -and $pixel.B -le 235) {
        $matched = $true
      }
    }
    if (-not $matched) {
      throw "Windows EXE still has a legacy/non-cobalt icon: $path. Clear Rust cache and rebuild."
    }
    Write-Host "PASS: Windows executable embeds the cobalt Fox Spirit icon: $path"
  } finally { $bitmap.Dispose() }
} finally { $icon.Dispose() }
