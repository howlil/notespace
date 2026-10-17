#Requires -Version 7.0
# Diagnostic-only preflight for real Windows WebView2 native acceptance.
# Intentionally never writes user profile contents, credentials, note data,
# browser cookies, or raw application crash logs to CI output.
$ErrorActionPreference = "Stop"

Write-Host "Windows native WebView2 acceptance environment"
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "OS: $($os.Caption), build $($os.BuildNumber)"
Write-Host "Runner image: $env:ImageOS / $env:ImageVersion"

$runtimeGuid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$registryPaths = @(
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeGuid",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid"
)
$webView2 = @()
foreach ($path in $registryPaths) {
  $version = (Get-ItemProperty -LiteralPath $path -Name pv -ErrorAction SilentlyContinue).pv
  if ($version) { $webView2 += [string]$version }
}
$webView2 = @($webView2 | Select-Object -Unique)
if ($webView2.Count -eq 0) {
  Write-Warning "WebView2 Evergreen Runtime version not found in expected registry paths"
} else {
  Write-Host "WebView2 Runtime version(s): $($webView2 -join ', ')"
}

$edgePaths = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
foreach ($path in $edgePaths) {
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $edgeVersion = (Get-Item -LiteralPath $path).VersionInfo.ProductVersion
    Write-Host "Microsoft Edge browser version: $edgeVersion"
    break
  }
}

$drivers = @(
  (Join-Path $PWD.Path "msedgedriver.exe"),
  (Join-Path $env:USERPROFILE ".cargo\bin\msedgedriver.exe")
)
$driverCommand = Get-Command "msedgedriver.exe" -ErrorAction SilentlyContinue
if ($driverCommand) { $drivers += $driverCommand.Source }
$driver = $drivers | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if ($driver) {
  $driverVersion = & $driver --version
  Write-Host "EdgeDriver: $driverVersion"
  if ($LASTEXITCODE -ne 0) { Write-Warning "EdgeDriver version query failed" }
  $match = [regex]::Match(($driverVersion -join ""), '\d+\.\d+\.\d+')
  if ($match.Success -and $webView2.Count -gt 0) {
    $prefix = $match.Value
    if (-not (@($webView2 | Where-Object { $_.StartsWith("$prefix.") }).Count -gt 0)) {
      Write-Warning "WebView2 and EdgeDriver versions differ; Microsoft recommends matching the first three version components"
    }
  }
} else {
  Write-Warning "No EdgeDriver executable found in repository or current PATH"
}
$tauri = Get-Command "tauri-driver.exe" -ErrorAction SilentlyContinue
if ($tauri) { Write-Host "Tauri driver: available" } else { Write-Warning "Tauri driver not found on PATH" }

$profile = if ($env:TAURI_NATIVE_PROFILE) { $env:TAURI_NATIVE_PROFILE } else {
  Join-Path $PWD.Path ".desktop-webdriver-data"
}
try {
  New-Item -Path $profile -ItemType Directory -Force | Out-Null
  $probe = Join-Path $profile ("write-test-" + [guid]::NewGuid().ToString("N"))
  [System.IO.File]::WriteAllText($probe, "ok")
  Remove-Item -LiteralPath $probe
  Write-Host "WebView2 user-data directory: writable"
} catch {
  throw "WebView2 user-data directory cannot be written: $($_.Exception.GetType().Name)"
}
Write-Host "Environment preflight finished; native WebDriver must still run successfully."
