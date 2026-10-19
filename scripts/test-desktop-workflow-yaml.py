#!/usr/bin/env python3
"""Validate actual GitHub Actions YAML, not just text fragments or regex.

Requires PyYAML installed by the desktop CI. GitHub `on` syntax is preserved
by BaseLoader rather than YAML 1.1 boolean coercion.
"""
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
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


def main():
    paths = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))
    assert paths, "No GitHub workflow files found"
    for path in paths:
        check_workflow(path)

    beta = check_workflow(WORKFLOWS / "publish-desktop-beta.yml")
    assert list(beta["on"]) == ["workflow_dispatch"], "Free beta must be manually launched"
    assert len(beta["jobs"]) == 1, "Free beta must remain a single Windows job"
    steps = beta["jobs"]["windows-msi-beta"]["steps"]
    scripts = "\n".join(str(s.get("run", "")) for s in steps if isinstance(s, dict))
    assert scripts.count("pnpm test:desktop:critical") == 1, "One critical native persistence journey required"
    assert "pnpm test:desktop:native" not in scripts, "Redundant native smoke reruns critical journey"
    assert scripts.count("gh release create") == 1, "Exactly one public prerelease action required"
    assert "gh attestation verify" in scripts, "Provenance verification is required"
    assert "scripts/assert-desktop-release-ci.mjs" in scripts, "Exact-master CI must be green"
    assert "pnpm dlx @tauri-apps/cli@2.12.3 build --config $overlay -- --locked" in scripts
    assert "cargo install tauri-cli" not in scripts, "Release must not compile Tauri CLI from source"
    assert "Swatinem/rust-cache@v2" in str(beta["jobs"]["windows-msi-beta"]["steps"])
    assert "pnpm/action-setup@v4" in str(beta["jobs"]["windows-msi-beta"]["steps"])
    assert "TAURI_SIGNING_PRIVATE_KEY" not in str(beta["jobs"]["windows-msi-beta"].get("env", {}))
    print(f"Validated {len(paths)} GitHub Actions workflows and free beta safety contract")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
