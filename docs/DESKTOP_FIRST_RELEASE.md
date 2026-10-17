# Notespace Desktop — first signed Windows release

## Distribution contract

- Windows 10/11 user download: https://github.com/howlil/notespace/releases
- Only a **published GitHub Release containing a verified .msi** is a public
  desktop release. A merge commit or CI artifact is not an installer release.
- First stable tag example: `v1.0.0`. Use only after completing the checklist.
- The first stable release has no earlier published MSI to compare against;
  `release-desktop.yml` explicitly skips N→N+1 **only** when no prior stable
  release exists. It must still pass first-install, real native WebDriver,
  authored Note persistence, SQLite protection, signing and provenance.
- GitHub-hosted web and Docker deployments are independent of the Windows MSI.

## Gate 1 — signing credentials (repository owner action)

Set names under
**Settings → Secrets and variables → Actions**
in `howlil/notespace`. Never paste signing private keys or Azure client
secrets in chat, issues, source files, or pull requests.

| GitHub scope | Name | Description |
| --- | --- | --- |
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater private signing key (full contents) |
| Secret, if key encrypted | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Updater signing key password |
| Variable | `NOTESPACE_UPDATER_PUBLIC_KEY` | Base64 of Tauri minisign public-key box |
| Variable | `NOTESPACE_AZURE_SIGNING_ENDPOINT` | Trusted Azure Artifact Signing HTTPS endpoint |
| Variable | `NOTESPACE_AZURE_SIGNING_ACCOUNT` | Azure Artifact Signing account |
| Variable | `NOTESPACE_AZURE_SIGNING_PROFILE` | Publisher certificate profile |
| Variable | `NOTESPACE_WINDOWS_SIGNER_SUBJECT` | Exact expected Authenticode subject |
| Secret | `AZURE_CLIENT_ID` | Azure service principal client ID |
| Secret | `AZURE_CLIENT_SECRET` | Azure service principal secret |
| Secret | `AZURE_TENANT_ID` | Azure tenant ID |

Generate a new updater keypair **locally**, not in GitHub Actions, and back up
the private key securely for future updates:

```powershell
# Requires the Tauri CLI on your development machine:
cargo tauri signer generate -w "$HOME/.tauri/notespace.key"
```

Copy the entire private key file to the GitHub secret and the CLI-generated
base64 public key to the GitHub variable. Losing the private updater key
prevents signing updates trusted by already-installed Notespace versions.

**Two independent signatures:** Tauri updater signing secures update payloads;
Azure Artifact Signing / Authenticode signs the Windows publisher identity.
Do not substitute one for the other. Configure Azure account and verified
publisher identity before attempting public stable release.

Upstream references:

- https://v2.tauri.app/plugin/updater/
- https://tauri.app/distribute/sign/windows/
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-github-cli

## Gate 2 — test current master, including native Windows

Ensure the `Verify` and `Verify Desktop` jobs for the **current master HEAD**
pass. Windows Server 2022 runs real Tauri/WebView2/EdgeDriver native acceptance,
and `windows-latest` compiles and tests Rust separately. Do not mark native UI
acceptance optional to make a release appear green.

The `release-credentials-preflight` job checks only that required variable and
secret **names resolve to nonempty values**; later build/signature steps
validate the actual credentials, certificate and generated artifacts. Failure
does not publish any MSI.

## Gate 3 — create and push first stable tag (repository owner action)

After Gate 1 and Gate 2, from an authenticated local checkout:

```bash
git fetch origin master
git checkout master
git pull --ff-only origin master
git tag -a v1.0.0 -m "Notespace Desktop v1.0.0"
git push origin v1.0.0
```

Choose another stable version only if appropriate; do not reuse or move an
already-published tag. The release workflow requires the tagged commit to be
the current `master` HEAD, and requires `vX.Y.Z` (stable SemVer).

Pushing the tag triggers `.github/workflows/release-desktop.yml`. It can also
trigger any existing container release workflow watching `v*` tags.

Alternatively, if an existing tag is present:
**Actions → Release desktop → Run workflow** with `release_tag=v1.0.0`.
Do not run the workflow with an arbitrary nonexistent tag.

## Gate 4 — verify the actual public MSI

Required successful workflow steps:

1. Release signing credential preflight.
2. Linux/macOS source/native checks.
3. Windows signed MSI build, real Tauri native smoke and authored persistence.
4. If a prior stable MSI exists, real installed MSI N→N+1 SQLite content proof.
5. Authenticode certificate subject validation and updater signature.
6. SHA256SUMS, MSI provenance attestation and attestation verification.
7. `Publish GitHub Release` with an authenticated `GH_TOKEN`.

Visit https://github.com/howlil/notespace/releases and open the new version.
Users choose the `.msi` asset under **Assets**. The filename comes from the
actual signed build; do not guess a version-specific download URL.

Verify the release contains precisely one installer, its `.msi.sig`,
`latest.json`, and `SHA256SUMS.txt`.

On Windows, users can validate the downloaded artifact:

```powershell
Get-AuthenticodeSignature -FilePath "./Notespace-installer.msi"
Get-FileHash -Algorithm SHA256 "./Notespace-installer.msi"
```

Replace the illustrative filename with the actual downloaded MSI and compare
the hash against `SHA256SUMS.txt`. A successful build or GitHub Actions upload
alone is **not** sufficient; only an actual published GitHub Release counts.

## Troubleshooting

- `Missing desktop signing configuration`: set the exact GitHub Actions
  secret or variable name reported by the first preflight job.
- `Invalid Azure signing endpoint` or authentication rejected: inspect Azure
  Artifact Signing account/profile and Entra service principal permissions.
- `DevToolsActivePort`: inspect the WebView2 and matching EdgeDriver preflight
  in Windows native acceptance. Do not suppress a failing product smoke test.
- `Publisher signer subject policy is missing`: configure the exact expected
  certificate subject, and check the signed MSI's real publisher.
- `release already exists`: do not overwrite an immutable signed release;
  create a new SemVer tag after applying a fix.

The workflow does not claim release completion if any gate fails.
