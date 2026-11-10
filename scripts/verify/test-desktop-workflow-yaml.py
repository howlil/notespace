#!/usr/bin/env python3
"""Validate actual GitHub Actions YAML, not just text fragments or regex.

Requires PyYAML installed by the desktop CI. GitHub `on` syntax is preserved
by BaseLoader rather than YAML 1.1 boolean coercion.
"""
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


class NoDuplicateKeys(yaml.BaseLoader):
    pass


def unique_mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if key in result:
            raise ValueError(f"Duplicate YAML mapping key: {key!r} at line {key_node.start_mark.line + 1}")
        result[key] = loader.construct_object(value_node)
    return result


NoDuplicateKeys.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping
)


def check_workflow(path):
    try:
        doc = yaml.load(path.read_text(encoding="utf-8"), Loader=NoDuplicateKeys)
    except (yaml.YAMLError, ValueError) as exc:
        raise AssertionError(f"{path}: invalid GitHub workflow YAML: {exc}") from exc
    assert isinstance(doc, dict), f"{path}: expected YAML mapping"
    assert "on" in doc, f"{path}: missing GitHub Actions event trigger"
    assert isinstance(doc.get("jobs"), dict) and doc["jobs"], f"{path}: missing runnable jobs"
    for name, job in doc["jobs"].items():
        assert isinstance(job, dict), f"{path}: job {name} is not a mapping"
        steps = job.get("steps", [])
        assert isinstance(steps, list), f"{path}: invalid steps in {name}"
        names = [step["name"] for step in steps if isinstance(step, dict) and "name" in step]
        assert len(names) == len(set(names)), f"{path}: duplicate step names in {name}"
    return doc


def check_native_verification(doc):
    selector = doc["jobs"]["classify-native"]
    assert "if" not in selector, "Policy preflight must run before both PR and master native proof"
    assert selector["steps"][0]["with"]["fetch-depth"] == "0"
    assert any(step.get("run") == "node --experimental-strip-types --test tests/ci-policy.test.ts" and "if" not in step for step in selector["steps"])
    job = doc["jobs"]["check-desktop-windows"]
    assert job["needs"] == "classify-native"
    assert job["if"] == "github.event_name == 'push' || needs.classify-native.outputs.desktop == 'true'"
    assert job["runs-on"] == "windows-2022"
    assert "continue-on-error" not in job
    assert job["env"]["TAURI_DRIVER_VERSION"] == "2.1.0"
    steps = job["steps"]
    root = next(step for step in steps if step.get("name") == "Configure isolated native tool root")
    assert root["run"] == '\"TAURI_DRIVER_ROOT=$env:RUNNER_TOOL_CACHE/notespace-tauri-driver\" >> $env:GITHUB_ENV'
    assert all("continue-on-error" not in step for step in steps)
    frozen = next(step for step in steps if step.get("run") == "bun install --frozen-lockfile")
    proof = next(step for step in steps if step.get("run") == "bun run test:desktop:critical")
    guard = next(step for step in steps if step.get("name") == "Validate native driver cache before use")
    assert all("if" not in step for step in (frozen, proof, guard)), "A cache hit must not skip validation/native proof"
    assert proof["env"]["TAURI_DRIVER"] == "${{ env.TAURI_DRIVER_ROOT }}/bin/tauri-driver.exe"
    install = next(step for step in steps if step.get("name") == "Install pinned Tauri WebDriver server on cache miss")
    assert install["if"] == "steps.native-driver.outputs.cache-hit != 'true'"
    assert "--version $env:TAURI_DRIVER_VERSION --locked --root $env:TAURI_DRIVER_ROOT" in install["run"]
    restores = {step["id"]: step for step in steps if step.get("uses") == "actions/cache/restore@v4"}
    assert set(restores) == {"native-packages", "native-driver"}
    package_root = next(step for step in steps if step.get("name") == "Configure isolated Bun package cache")
    assert package_root["run"] == '\"BUN_INSTALL_CACHE_DIR=$env:RUNNER_TOOL_CACHE/notespace-bun-packages\" >> $env:GITHUB_ENV'
    assert restores["native-packages"]["with"]["path"] == "${{ env.BUN_INSTALL_CACHE_DIR }}", "Never archive installed Windows node_modules junctions"
    assert "env.BUN_VERSION" in restores["native-packages"]["with"]["key"] and "env.NODE_VERSION" in restores["native-packages"]["with"]["key"]
    assert "hashFiles('bun.lock', 'package.json', 'apps/web/package.json')" in restores["native-packages"]["with"]["key"]
    assert "env.TAURI_DRIVER_VERSION" in restores["native-driver"]["with"]["key"]
    topology = next(step for step in steps if step.get("run") == "node scripts/verify/prepare-native-package-cache.mjs")
    assert "if" not in topology, "Package snapshots must exclude all Windows lookup junctions"
    assert "native-packages-v2-" in restores["native-packages"]["with"]["key"], "Never reuse snapshots with nonportable alias metadata"
    saves = [step for step in steps if step.get("uses") == "actions/cache/save@v4"]
    assert len(saves) == 2
    for saved, restore_id in zip(saves, ["native-packages", "native-driver"]):
        assert saved["if"] == f"github.ref == 'refs/heads/master' && steps.{restore_id}.outputs.cache-hit != 'true'"
        assert steps.index(saved) > max(steps.index(proof), steps.index(topology)), "Only successfully proven master builds may seed caches"
        assert saved["with"]["path"] == restores[restore_id]["with"]["path"]
        assert saved["with"]["key"] == f"${{{{ steps.{restore_id}.outputs.cache-primary-key }}}}"


def check_frontend_proof(doc):
    web, browser = (doc["jobs"][name] for name in ("web", "browser"))
    build = "bun run --filter @notespace/web build"
    assert browser["needs"] == "classify", "Browser preparation must overlap web checks, not await their runner"
    assert web["needs"] == "classify"
    assert browser["if"] == "needs.classify.outputs.browser == 'true'"
    for job in (web, browser):
        check_frontend_setup(job)
    checks = next(s for s in web["steps"] if s.get("run") == "bun run typecheck && bun run lint && bun run test")
    assert "if" not in checks, "Web checks remain mandatory alongside browser proof"
    check_frontend_builds(web, browser, build)


def check_frontend_setup(job):
    assert "continue-on-error" not in job
    assert all("continue-on-error" not in s for s in job["steps"])
    install = next(s for s in job["steps"] if s.get("run") == "bun install --frozen-lockfile")
    assert "if" not in install
    transfers = [s for s in job["steps"] if s.get("uses", "").startswith(("actions/download-artifact@", "actions/upload-artifact@"))]
    assert all(s.get("if") == "failure()" for s in transfers), "No cross-run build handoff or duplicate artifact transport"


def check_frontend_builds(web, browser, build):
    web_builds = [s for s in web["steps"] if s.get("run") == build]
    browser_builds = [s for s in browser["steps"] if s.get("run") == build]
    assert len(web_builds) == len(browser_builds) == 1, "Exactly one build owner per selection"
    assert web_builds[0]["if"] == "needs.classify.outputs.browser != 'true'", "Web-only PRs must build; browser PRs must not build twice"
    assert "if" not in browser_builds[0], "A selected browser job must build its own exact checkout"
    proof = next(s for s in browser["steps"] if "ci.mjs browser-mode" in s.get("run", ""))
    assert "if" not in proof and browser["steps"].index(browser_builds[0]) < browser["steps"].index(proof)


def check_release_orchestration(doc):
    mode_input = doc["on"]["workflow_dispatch"]["inputs"]["mode"]
    assert mode_input["default"] == "preflight" and set(mode_input["options"]) == {"preflight", "desktop-beta", "desktop-stable", "image", "cloudflare"}
    assert doc["permissions"] == {"contents": "read", "actions": "read"}
    jobs = doc["jobs"]
    assert set(jobs) == {"preflight", "beta", "stable-prepare", "stable", "image", "cloudflare"}
    routes = {"beta": "desktop-beta", "stable-prepare": "desktop-stable", "stable": "desktop-stable", "image": "image", "cloudflare": "cloudflare"}
    owners = {"beta": "publish-desktop-beta.yml", "stable-prepare": "publish-desktop.yml", "stable": "release-desktop.yml", "cloudflare": "deploy-cloudflare.yml"}
    for name, mode in routes.items():
        job = jobs[name]
        assert job["if"] == f"needs.preflight.outputs.mode == '{mode}'", f"{name}: explicit validated destination required"
        expected = ["preflight", "stable-prepare"] if name == "stable" else "preflight"
        assert job["needs"] == expected, f"{name}: must await admission (and immutable tag for stable)"
        assert job.get("secrets") != "inherit", "Do not pass unrelated secrets across release lanes"
        if "uses" in job:
            assert job["uses"] == f"./.github/workflows/{owners[name]}", f"{name}: wrong artifact owner"
            callee = check_workflow(WORKFLOWS / Path(job["uses"]).name)
            assert set(job["secrets"]) == set(callee["on"]["workflow_call"]["secrets"])
    assert jobs["stable-prepare"]["with"]["prepare_only"] == "true", "Canonical stable route must not also dispatch a second publisher"
    assert jobs["stable"]["with"]["release_tag"] == "${{ needs.stable-prepare.outputs.release_tag }}"
    prepare = check_workflow(WORKFLOWS / "publish-desktop.yml")
    assert prepare["on"]["workflow_call"]["outputs"]["release_tag"]["value"] == "${{ jobs.prepare-and-dispatch.outputs.release_tag }}"
    dispatch = next(s for s in prepare["jobs"]["prepare-and-dispatch"]["steps"] if s.get("name") == "Dispatch signed MSI release workflow")
    assert dispatch["if"] == "${{ !inputs.prepare_only }}", "Legacy fallback only; reusable orchestration cannot fan out"
    steps = jobs["preflight"]["steps"]
    request = next(s for s in steps if s.get("id") == "request")
    assert request["run"] == "node scripts/release/release-request.mjs" and "if" not in request
    assert jobs["preflight"]["outputs"]["mode"] == "${{ steps.request.outputs.mode }}"
    collector = next(s for s in steps if "assert-desktop-release-ci.mjs --collect " in s.get("run", ""))
    assert "if" not in collector and steps.index(collector) > steps.index(request)
    assert all("write" not in str(s) and "secrets." not in str(s) for s in steps), "Preflight cannot publish or read publisher secrets"
    assert doc["concurrency"]["cancel-in-progress"] == "false" and "desktop-" in doc["concurrency"]["group"]


def main():
    paths = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))
    assert paths, "No GitHub workflow files found"
    for path in paths:
        check_workflow(path)

    ci = check_workflow(WORKFLOWS / "ci.yml")
    expected = {"classify", "web", "server", "landing", "browser", "desktop", "release-policy", "compose"}
    assert set(ci["jobs"]) == expected | {"gate"}, "All CI jobs must belong to the gate contract"
    assert ci["on"].get("pull_request") == "", "PR gate must have no top-level path filters"
    assert ci["on"]["push"]["branches"] == ["master"]
    assert ci["on"]["workflow_dispatch"] == "" and ci["on"]["schedule"], "Keep executable full regression outside PR/master"
    assert ci["env"]["CI_EVENT"] == "${{ github.event_name }}"
    assert ci["jobs"]["gate"]["name"] == "${{ (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && 'regression / gate' || 'ci / gate' }}", "Regression failures must not overwrite required gate identity"
    assert ci["concurrency"]["cancel-in-progress"] == "${{ github.event_name == 'pull_request' }}"
    assert "github.event_name" in ci["concurrency"]["group"]
    assert ci["jobs"]["gate"]["if"] == "always()", "Final gate must run after failure/skip"
    assert set(ci["jobs"]["gate"]["needs"]) == expected, "No required job may escape aggregation"
    assert ci["permissions"] == {"contents": "read"}, "Untrusted PRs cannot receive write authority"
    assert ci["jobs"]["desktop"]["uses"] == "./.github/workflows/verify-desktop.yml"
    assert ci["jobs"]["desktop"]["with"]["profile"] == "${{ (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && 'regression' || 'native' }}"
    browser_script = next(s["run"] for s in ci["jobs"]["browser"]["steps"] if "ci.mjs browser-mode" in s.get("run", ""))
    assert 'browser-e2e.mjs --mode "$MODE"' in browser_script and "ci.mjs paths" in browser_script
    check_frontend_proof(ci)
    compose_steps = ci["jobs"]["compose"]["steps"]
    assert any(s.get("run") == "python3 scripts/verify/smoke-persistence.py --compose-restart" and "if" not in s for s in compose_steps)
    assert any(s.get("if") == "always()" and "down" in s.get("run", "") for s in compose_steps)
    desktop = check_workflow(WORKFLOWS / "verify-desktop.yml")
    broad = "inputs.profile == 'regression' || (github.event_name == 'push' && inputs.profile != 'native')"
    assert desktop["env"]["EXTENDED_DESKTOP"] == "${{ " + broad + " }}"
    assert desktop["jobs"]["check-desktop-windows-latest"]["if"] == broad
    assert desktop["on"]["workflow_call"]["inputs"]["profile"]["default"] == "legacy"
    assert any(s.get("run") == "cargo test --locked" and s.get("if") == "env.EXTENDED_DESKTOP == 'true'" for s in desktop["jobs"]["check-desktop"]["steps"])
    classify_steps = ci["jobs"]["classify"]["steps"]
    preflight = next(step for step in classify_steps if step.get("run") == "node --experimental-strip-types --test tests/ci-policy.test.ts")
    planner = next(step for step in classify_steps if step.get("id") == "plan")
    assert "if" not in preflight and classify_steps.index(preflight) < classify_steps.index(planner), "Classifier cannot skip its own proof"
    for name in expected - {"classify", "desktop"}:
        job = ci["jobs"][name]
        assert job["outputs"].get("sha") == "${{ steps.identity.outputs.sha }}", f"{name}: missing SHA binding"
        identity = next(step for step in job["steps"] if step.get("id") == "identity")
        assert identity["env"]["EXPECTED_SHA"] == "${{ github.sha }}"
        assert identity["run"] == "node scripts/verify/ci.mjs identity"

    check_native_verification(check_workflow(WORKFLOWS / "verify-desktop.yml"))

    auto = check_workflow(WORKFLOWS / "auto-desktop-beta.yml")
    assert list(auto["on"]) == ["workflow_dispatch"] and auto["permissions"] == {"contents": "read", "actions": "read"}
    for filename in ["auto-desktop-beta.yml", "publish-desktop.yml", "publish-desktop-beta.yml", "release-desktop.yml", "release.yml", "deploy-cloudflare.yml"]:
        events = set(check_workflow(WORKFLOWS / filename)["on"])
        assert "workflow_dispatch" in events and events <= {"workflow_dispatch", "workflow_call"}, f"{filename}: push/tag/completion must never publish or dispatch"
    for filename, job_name in [("auto-desktop-beta.yml", "preflight"), ("publish-desktop.yml", "prepare-and-dispatch"), ("publish-desktop-beta.yml", "windows-msi-beta"), ("release-desktop.yml", "release-credentials-preflight"), ("release.yml", "image"), ("deploy-cloudflare.yml", "deploy")]:
        workflow = check_workflow(WORKFLOWS / filename)
        gates = [s for s in workflow["jobs"][job_name]["steps"] if "assert-desktop-release-ci.mjs" in s.get("run", "")]
        assert len(gates) == 1 and "if" not in gates[0], f"{filename}: publisher cannot skip exact-master preflight"
        assert "assert-desktop-release-ci.mjs --collect " in gates[0]["run"], "Never trust a name-only or stale offline CI record for publication"
        assert gates[0]["env"]["GH_TOKEN"] == "${{ github.token }}"

    image = check_workflow(WORKFLOWS / "release.yml")
    check_release_orchestration(image)
    image_steps = image["jobs"]["image"]["steps"]
    meta = next(s for s in image_steps if s.get("id") == "meta")
    binding = next(s for s in image_steps if s.get("name") == "Bind image version to immutable source tag")
    assert binding["if"] == "inputs.version != ''" and image_steps.index(binding) < image_steps.index(meta)
    assert 'git rev-parse "refs/tags/$IMAGE_VERSION^{commit}"' in binding["run"]
    assert "value=${{ inputs.version }}" in meta["with"]["tags"]
    assert "enable=${{ inputs.version != '' }}" in meta["with"]["tags"], "Blank image version cannot update latest"
    for filename, job_name, effect in [("release.yml", "image", "docker/login-action@v3"), ("release-desktop.yml", "release-credentials-preflight", "Require all production signing configuration"), ("deploy-cloudflare.yml", "deploy", "cloudflare/wrangler-action@v4")]:
        steps = check_workflow(WORKFLOWS / filename)["jobs"][job_name]["steps"]
        gate_index = next(i for i, s in enumerate(steps) if "assert-desktop-release-ci.mjs --collect " in s.get("run", ""))
        effect_index = next(i for i, s in enumerate(steps) if effect in (s.get("uses"), s.get("name")))
        assert gate_index < effect_index, f"{filename}: preflight must precede mutation/credentials"

    beta = check_workflow(WORKFLOWS / "publish-desktop-beta.yml")
    assert set(beta["on"]) == {"workflow_dispatch", "workflow_call"}, "Free beta must be manual or explicitly orchestrated"
    assert len(beta["jobs"]) == 1, "Free beta must remain a single Windows job"
    steps = beta["jobs"]["windows-msi-beta"]["steps"]
    scripts = "\n".join(str(s.get("run", "")) for s in steps if isinstance(s, dict))
    assert scripts.count("bun run test:desktop:critical") == 1, "One critical native persistence journey required"
    assert "bun run test:desktop:native" not in scripts, "Redundant native smoke reruns critical journey"
    assert scripts.count("gh release create") == 1, "Exactly one public prerelease action required"
    assert "gh attestation verify" in scripts, "Provenance verification is required"
    assert "scripts/release/assert-desktop-release-ci.mjs" in scripts, "Exact-master CI must be green"
    assert "bunx @tauri-apps/cli@2.12.3 build --config $overlay -- --locked" in scripts
    assert "cargo install tauri-cli" not in scripts, "Release must not compile Tauri CLI from source"
    assert "Swatinem/rust-cache@v2" in str(beta["jobs"]["windows-msi-beta"]["steps"])
    assert "oven-sh/setup-bun@v2" in str(beta["jobs"]["windows-msi-beta"]["steps"])
    assert "TAURI_SIGNING_PRIVATE_KEY" not in str(beta["jobs"]["windows-msi-beta"].get("env", {}))
    print(f"Validated {len(paths)} GitHub Actions workflows and free beta safety contract")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
