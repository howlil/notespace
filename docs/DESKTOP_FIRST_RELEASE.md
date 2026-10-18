# Notespace Desktop — free beta and optional signed stable releases

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

## Route A — Free unsigned beta (recommended for first desktop download)

**Cost: Rp0 for Azure and certificate signing.** You do **not** need an
Azure Artifact Signing account, a publisher certificate, a Tauri updater
private key, or a paid download backend.

1. Merge changes to `master` and ensure `Verify` and `Verify Desktop`
   **push** workflow runs are green for the latest master commit.
2. Open [Actions → Publish Desktop Beta (free)](https://github.com/howlil/notespace/actions/workflows/publish-desktop-beta.yml).
3. Choose **Run workflow** on branch `master`. No version input or Git tag
   creation is required. The first beta is `v0.1.0-beta.1`; subsequent
   successful prereleases automatically increment the beta number.
4. GitHub Actions will build an unsigned MSI on Windows, exercise the **real
   Tauri/WebView2 UI** and product persistence, calculate SHA-256, generate
   and verify GitHub build provenance, then create a GitHub **prerelease**.
5. Share https://github.com/howlil/notespace/releases with users.

**User-visible warning:** this public beta has no Authenticode publisher
signature. SmartScreen may warn or block installing it. Download only from
the official GitHub Releases page and check `SHA256SUMS.txt`. Automatic
desktop updates are intentionally **disabled** for unsigned beta builds;
users install each newer beta manually. Do not promote this installer as a
signed stable release.

**Failures are not bypassed:** native Windows test failure, data loss,
checksum/provenance failure, or stale `master` blocks publishing. A
successful upload to CI Artifacts alone is **not a public release**.

The future signed stable route below remains available but is **entirely
optional for publishing the free beta**.

## Route B — Signed stable with automatic updates (optional)

The following Gates 1–4 are **only for signed production releases**.
Azure Artifact Signing is the configured publisher identity mechanism
in this specific signed workflow, not a mandatory Tauri or Windows cost.

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

## Gate 3 — One-click GitHub release automation

The normal release route **does not require a local Git tag or terminal**.

1. After all secrets and variables in Gate 1 are configured, ensure `Verify`
   and `Verify Desktop` completed successfully for the latest `master` push.
2. Open [Actions → Publish Desktop (one click)](https://github.com/howlil/notespace/actions/workflows/publish-desktop.yml).
3. Select **Run workflow** and choose branch **master**.
4. Use **patch** to increment the patch version automatically; choose **minor**
   or **major** for larger releases. The first release defaults to `v1.0.0`.
   Optionally enter an exact higher stable `version`, such as `1.2.0`.
5. Start the run. The workflow will:
   - reject non-master refs or commits without green master CI;
   - reject missing updater/Windows signing configuration;
   - calculate the next stable version from already-published GitHub Releases;
   - reject a tag collision, or a version older than the latest stable;
   - re-check the exact master HEAD, create an annotated tag, and push it;
   - **explicitly dispatch** `release-desktop.yml` for this tag.

Why explicit dispatch? Tags pushed with the Actions `GITHUB_TOKEN` do **not**
fire another workflow's `push` trigger. An authenticated
`workflow_dispatch` is explicitly allowed, so this automation needs no PAT
or custom GitHub App token. The launcher requires `actions: write` and
`contents: write` permissions.

**Important:** Launcher success means the signed release workflow was
*started*, not that GitHub Release was published. Check its run: all Windows
native acceptance, signing, data migration, checksum and provenance checks
must finish successfully before `gh release create` publishes any MSI.

### Retries, collisions, and race safety

- Launcher jobs share a concurrency group to prevent concurrent version
  selection and tag creation.
- If `master` changes while preparing a release, the launcher refuses
  tagging rather than tagging an unverified commit.
- If tag creation succeeds but dispatch fails, **do not recreate or force
  move the tag**. In [Actions → Release desktop](https://github.com/howlil/notespace/actions/workflows/release-desktop.yml),
  choose **Run workflow** with the existing `release_tag`; that workflow
  can retry as long as the tag still points at the current `master` HEAD.
- Signed GitHub Releases are immutable: don't overwrite MSI assets after
  publishing. Produce a new version for any correction.
- `GITHUB_TOKEN` tag pushes will **not** trigger independent `push.tags`
  workflows, including any container-image pipeline. The one-click flow
  explicitly publishes the **desktop MSI**, not container images.

### Advanced manual fallback

You can still create a tag manually to trigger the existing release workflow:

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
git tag -a v1.0.0 -m "Notespace Desktop v1.0.0"
git push origin v1.0.0
```

Use an appropriate unused version and ensure the tag is at current
`master`. Normal usage should use the one-click Actions launcher instead.

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
