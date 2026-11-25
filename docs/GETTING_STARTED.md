# Getting started

Notespace runs as a Windows desktop app or a self-hosted browser app. Both use SQLite for durable authored data. The two installations do not automatically share or merge databases.

## Windows desktop

1. Open [Releases](https://github.com/howlil/notespace/releases).
2. Choose a stable release, or a prerelease if you deliberately want the beta channel.
3. Download the Windows x64 MSI listed in Assets and follow the installer.
4. Launch Notespace and create a workspace.

A CI debug executable is not a published installer. Where `SHA256SUMS.txt` is published, compare the MSI hash against its matching entry, for example using PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\Notespace_<version>_x64_en-US.msi
```

Replace the placeholder with the actual downloaded filename. A checksum checks integrity against the published manifest; it is not by itself a publisher signature. Windows may warn about installers without a trusted publisher certificate. Verify the source before proceeding. Do not disable OS security controls.

Beta releases from v0.1.0-beta.3 support Tauri-signature-verified in-app updates; earlier betas require a one-time manual upgrade. Back up your library before upgrading. See [desktop distribution](DESKTOP_FIRST_RELEASE.md) for channel-specific signing and release details.

## Self-hosted browser

Install Git, Docker and Docker Compose, then:

```sh
git clone https://github.com/howlil/notespace.git
cd notespace
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Open http://localhost:8080. Keep the persistent volume; do not run `docker compose down -v` unless you intend to erase it. For remote deployments, read [Self-hosting](SELF_HOSTING.md) before exposing an instance.

## First workspace

1. Create or select a category in the workspace library.
2. Create a workspace and open its canvas.
3. Use the canvas tools to add notes, shapes, connections, images or code.
4. Wait for durable saves to finish before closing or switching workspaces.
5. Use Quick Open (`Ctrl/Cmd+K`) to find workspaces and the library tools to back up your data.

Read the [user guide](USER_GUIDE.md) next. For installation or runtime problems, see [Support](../SUPPORT.md).
