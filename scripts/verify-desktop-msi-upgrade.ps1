#Requires -Version 7.0
# Real Windows MSI N -> N+1 proof, executed on an isolated GitHub runner.
# The old and new binaries must BOTH be installed via msiexec, not launched
# directly from cargo target/. This script deliberately fails closed.

$ErrorActionPreference = "Stop"
$oldMsi = $env:NOTESPACE_UPGRADE_OLD_MSI
$newMsi = $env:NOTESPACE_UPGRADE_NEW_MSI
$oldVersion = $env:NOTESPACE_UPGRADE_OLD_VERSION
$newVersion = $env:NOTESPACE_UPGRADE_NEW_VERSION
if (-not $oldMsi -or -not $newMsi -or -not $oldVersion -or -not $newVersion) {
  throw "Specify old/new MSI paths and old/new versions through NOTESPACE_UPGRADE_*"
}
if (-not (Test-Path -LiteralPath $oldMsi -PathType Leaf) -or -not (Test-Path -LiteralPath $newMsi -PathType Leaf)) {
  throw "Both previous and candidate MSI artifacts must be present"
}
if ($oldVersion -notmatch '^\d+\.\d+\.\d+$' -or $newVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "MSI upgrade proof requires stable numeric SemVer"
}
if ([version]$newVersion -le [version]$oldVersion) {
  throw "Candidate $newVersion must be newer than previous $oldVersion"
}

$root = Join-Path $env:RUNNER_TEMP ("notespace-upgrade-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $root | Out-Null
$env:NOTESPACE_DESKTOP_TEST_DATA_DIR = Join-Path $root "library"
$env:TAURI_NATIVE_PROFILE = Join-Path $root "webview"
$env:NOTESPACE_UPGRADE_FIXTURE = Join-Path $root "authored-fixture.json"
$inventory = Join-Path $root "inventory.json"
New-Item -ItemType Directory -Path $env:NOTESPACE_DESKTOP_TEST_DATA_DIR | Out-Null

function Install-Msi([string]$msi, [string]$stage) {
  $log = Join-Path $root "$stage-msiexec.log"
  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @(
    "/i", "`"$msi`"", "/qn", "/norestart", "/l*v", "`"$log`""
  ) -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "MSI $stage failed (exit code $($process.ExitCode)); install log: $log"
  }
}

function Get-InstalledNotespace {
  $registry = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  $entries = @(Get-ItemProperty -Path $registry -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq "Notespace" })
  if ($entries.Count -ne 1) {
    throw "Expected exactly one Notespace Windows Installer registration, got $($entries.Count)"
  }
  $entry = $entries[0]
  $roots = New-Object System.Collections.Generic.List[string]
  if ($entry.InstallLocation) { $roots.Add($entry.InstallLocation.Trim('"')) }
  if ($entry.DisplayIcon) {
    $iconPath = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"')
    if (Test-Path -LiteralPath $iconPath -PathType Leaf) {
      $roots.Add((Split-Path -Parent $iconPath))
    }
  }
  foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $base) { continue }
    foreach ($leaf in @("Notespace", "Programs\Notespace")) {
      $roots.Add((Join-Path $base $leaf))
    }
  }
  $binaries = @()
  foreach ($folder in ($roots | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { continue }
    $binaries += @(Get-ChildItem -LiteralPath $folder -Filter "*.exe" -Recurse -File |
      Where-Object { $_.BaseName -match '^(?i:notespace|notespace-desktop)$' })
  }
  $binaries = @($binaries | Sort-Object -Property FullName -Unique)
  if ($binaries.Count -ne 1) {
    throw "Could not unambiguously resolve installed Notespace EXE; found $($binaries.Count)"
  }
  return @{ Binary = $binaries[0].FullName; Version = ([string]$entry.DisplayVersion) }
}

function Assert-InstalledVersion($installed, [string]$expected) {
  if ($installed.Version -ne $expected) {
    throw "Windows installer registered version '$($installed.Version)', expected '$expected'"
  }
}

Write-Host "Installing real previous release MSI $oldVersion..."
Install-Msi $oldMsi "previous"
$old = Get-InstalledNotespace
Assert-InstalledVersion $old $oldVersion
$env:TAURI_APP_BINARY = $old.Binary
node scripts/desktop-webdriver-smoke.mjs --upgrade-seed
if ($LASTEXITCODE -ne 0) { throw "Previous release failed to create a durable Workspace fixture" }
python scripts/desktop-upgrade-inventory.py capture (Join-Path $env:NOTESPACE_DESKTOP_TEST_DATA_DIR "notespace.db") $inventory
if ($LASTEXITCODE -ne 0) { throw "Failed to inspect old version's SQLite library" }

Write-Host "Upgrading same installed application to MSI $newVersion..."
Install-Msi $newMsi "candidate"
$new = Get-InstalledNotespace
Assert-InstalledVersion $new $newVersion
if ($new.Binary -ne $old.Binary) {
  throw "Installer created a second Notespace app instead of upgrading in place ($($old.Binary) vs $($new.Binary))"
}
$env:TAURI_APP_BINARY = $new.Binary
node scripts/desktop-webdriver-smoke.mjs --upgrade-verify
if ($LASTEXITCODE -ne 0) { throw "Candidate MSI cannot read previously authored Note" }
python scripts/desktop-upgrade-inventory.py verify (Join-Path $env:NOTESPACE_DESKTOP_TEST_DATA_DIR "notespace.db") $inventory
if ($LASTEXITCODE -ne 0) { throw "Candidate MSI lost or changed durable user data" }
Write-Host "PASS: MSI upgraded $oldVersion -> $newVersion in place and preserved the same SQLite library"
