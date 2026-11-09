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
    assert set(restores) == {"native-modules", "native-driver"}
    assert restores["native-modules"]["with"]["path"].split() == ["node_modules", "apps/web/node_modules"]
    assert "env.BUN_VERSION" in restores["native-modules"]["with"]["key"] and "env.NODE_VERSION" in restores["native-modules"]["with"]["key"]
    assert "hashFiles('bun.lock', 'package.json', 'apps/web/package.json')" in restores["native-modules"]["with"]["key"]
    assert "env.TAURI_DRIVER_VERSION" in restores["native-driver"]["with"]["key"]
    topology = next(step for step in steps if step.get("run") == "node scripts/verify/check-native-dependency-cache.mjs")
    assert "if" not in topology, "Dependency roots cannot silently include workspace/profile junctions"
    saves = [step for step in steps if step.get("uses") == "actions/cache/save@v4"]
    assert len(saves) == 2
    for saved, restore_id in zip(saves, ["native-modules", "native-driver"]):
        assert saved["if"] == f"github.ref == 'refs/heads/master' && steps.{restore_id}.outputs.cache-hit != 'true'"
        assert steps.index(saved) > max(steps.index(proof), steps.index(topology)), "Only successfully proven master builds may seed caches"
        assert saved["with"]["path"] == restores[restore_id]["with"]["path"]
        assert saved["with"]["key"] == f"${{{{ steps.{restore_id}.outputs.cache-primary-key }}}}"


def main():
    paths = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))
    assert paths, "No GitHub workflow files found"
    for path in paths:
        check_workflow(path)

    ci = check_workflow(WORKFLOWS / "ci.yml")
    expected = {"classify", "web", "server", "landing", "browser", "desktop", "release-policy"}
    assert set(ci["jobs"]) == expected | {"gate"}, "All CI jobs must belong to the gate contract"
    assert ci["on"].get("pull_request") == "", "PR gate must have no top-level path filters"
    assert ci["jobs"]["gate"]["name"] == "ci / gate", "Keep one stable check identity for cutover"
    assert ci["jobs"]["gate"]["if"] == "always()", "Final gate must run after failure/skip"
    assert set(ci["jobs"]["gate"]["needs"]) == expected, "No required job may escape aggregation"
    assert ci["permissions"] == {"contents": "read"}, "Untrusted PRs cannot receive write authority"
    assert ci["jobs"]["desktop"]["uses"] == "./.github/workflows/verify-desktop.yml"
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

    beta = check_workflow(WORKFLOWS / "publish-desktop-beta.yml")
    assert list(beta["on"]) == ["workflow_dispatch"], "Free beta must be manually launched"
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
