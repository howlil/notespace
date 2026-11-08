$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$desktopRoot = Join-Path $repoRoot "apps\desktop\src-tauri"
$webRoot = Join-Path $repoRoot "apps\web"
$desktopPrefix = $desktopRoot + [System.IO.Path]::DirectorySeparatorChar
$vitePattern = [regex]::Escape($webRoot) + "[\\/]+node_modules[\\/]+vite[\\/]+bin[\\/]+vite\.js"

function Get-CheckoutDesktopProcesses {
  Get-CimInstance Win32_Process | Where-Object {
    $name = [System.IO.Path]::GetFileName($_.Name)
    $executable = $_.ExecutablePath
    $isNotespaceRuntime = $name -match "^(notespace-desktop|notespace-server.*)\.exe$"
    $isInsideCheckout = $executable -and $executable.StartsWith(
      $desktopPrefix,
      [System.StringComparison]::OrdinalIgnoreCase
    )
    $isNotespaceRuntime -and $isInsideCheckout
  }
}

# Ask the checkout's debug window to close through Tauri's flush handshake.
# If the user has an unsaved edit or a backup is running, let it stay open.
$desktopProcesses = @(Get-CheckoutDesktopProcesses | Where-Object {
  $_.Name -match "^notespace-desktop\.exe$"
})
foreach ($processInfo in $desktopProcesses) {
  $desktopProcess = Get-Process -Id $processInfo.ProcessId -ErrorAction Stop
  if (-not $desktopProcess.CloseMainWindow()) {
    throw "Could not request a graceful close for checkout desktop process $($processInfo.ProcessId)."
  }
  if (-not $desktopProcess.WaitForExit(15000)) {
    throw "Checkout desktop process $($processInfo.ProcessId) did not finish its close and save flow; it was left running."
  }
}

$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
  $remainingRuntime = @(Get-CheckoutDesktopProcesses | Where-Object {
    $_.Name -match "^notespace-server.*\.exe$"
  })
  if ($remainingRuntime.Count -eq 0) { break }
  Start-Sleep -Milliseconds 150
} while ([DateTime]::UtcNow -lt $deadline)

if ($remainingRuntime.Count -gt 0) {
  $ids = ($remainingRuntime | ForEach-Object ProcessId) -join ", "
  throw "Checkout sidecar process(es) $ids are still running; refusing to force-stop them."
}

# Vite has no authored database state. Match its command to this exact checkout
# so another worktree's development server remains untouched.
$viteProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -match $vitePattern
})
foreach ($processInfo in $viteProcesses) {
  Stop-Process -Id $processInfo.ProcessId -ErrorAction SilentlyContinue
}

exit 0
