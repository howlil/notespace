#Requires -Version 7.0
# Installs the Microsoft EdgeDriver build matching the Evergreen WebView2
# Runtime that actually hosts the Tauri window (NOT the Edge browser version).
# https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver
$ErrorActionPreference = "Stop"
$runtimeGuid = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$locations = @(
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeGuid",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid"
)
$versions = @()
foreach ($location in $locations) {
  $value = (Get-ItemProperty -LiteralPath $location -Name pv -ErrorAction SilentlyContinue).pv
  if ($value -and [string]$value -match '^\d+\.\d+\.\d+\.\d+$') {
    $versions += [version][string]$value
  }
}
$versions = @($versions | Sort-Object -Unique -Descending)
if ($versions.Count -eq 0) {
  throw "WebView2 Evergreen Runtime is missing; refusing an unverified Edge browser-based driver"
}
if ($versions.Count -gt 1) {
  Write-Host "Multiple WebView2 versions registered; choosing newest installed version"
}
$version = $versions[0].ToString()
Write-Host "Installing Microsoft EdgeDriver for WebView2 Runtime version $version"
$uri = "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip"
$directory = Join-Path $env:RUNNER_TEMP ("webview2-driver-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $directory -Force | Out-Null
try {
  $zip = Join-Path $directory "edgedriver_win64.zip"
  Invoke-WebRequest -Uri $uri -OutFile $zip -MaximumRedirection 3
  Expand-Archive -LiteralPath $zip -DestinationPath $directory -Force
  $candidate = Join-Path $directory "msedgedriver.exe"
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Microsoft EdgeDriver archive lacks msedgedriver.exe"
  }
  $sig = Get-AuthenticodeSignature -LiteralPath $candidate
  if ($sig.Status -ne "Valid" -or -not $sig.SignerCertificate -or
      $sig.SignerCertificate.Subject -notmatch "Microsoft") {
    throw "Downloaded EdgeDriver publisher Authenticode signature is invalid"
  }
  $reported = (& $candidate --version) -join " "
  if ($LASTEXITCODE -ne 0) { throw "Downloaded EdgeDriver executable cannot run" }
  $prefix = ($version.Split(".")[0..2] -join ".") + "."
  if ($reported -notmatch [regex]::Escape($prefix)) {
    throw "Downloaded EdgeDriver does not match installed WebView2 Runtime version $version"
  }
  $destination = Join-Path $PWD.Path "msedgedriver.exe"
  Copy-Item -LiteralPath $candidate -Destination $destination -Force
  Write-Host "Installed Authenticode-verified EdgeDriver matching WebView2 $version"
} finally {
  Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue
}
