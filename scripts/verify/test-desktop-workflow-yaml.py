#!/usr/bin/env python3
"""Single-owner parser and security-invariant validator for GitHub Actions workflows.

Requires PyYAML (installed by CI). BaseLoader avoids YAML 1.1 boolean coercion on `on:`.
"""
from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"
SHA_PINNED_ACTION = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$")
DOCKER_DIGEST_PINNED = re.compile(r"^FROM\s+\S+@sha256:[0-9a-f]{64}(?:\s+AS\s+\S+)?$")


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
        uses = job.get("uses")
        if uses is not None:
            assert isinstance(uses, str) and (uses.startswith("./") or SHA_PINNED_ACTION.match(uses)), (
                f"{path}: job {name} uses unpinned action {uses!r}"
            )
        steps = job.get("steps", [])
        assert isinstance(steps, list), f"{path}: invalid steps in {name}"
        names = [step["name"] for step in steps if isinstance(step, dict) and "name" in step]
        assert len(names) == len(set(names)), f"{path}: duplicate step names in {name}"
        for step in steps:
            if not isinstance(step, dict):
                continue
            step_uses = step.get("uses")
            if step_uses is not None:
                assert isinstance(step_uses, str) and (
                    step_uses.startswith("./") or SHA_PINNED_ACTION.match(step_uses)
                ), f"{path}: job {name} step uses unpinned third-party action {step_uses!r}"
                if step_uses.startswith("actions/checkout@"):
                    persist = (step.get("with") or {}).get("persist-credentials")
                    if path.name == "publish-desktop.yml" and name == "prepare-and-dispatch":
                        assert persist == "true", f"{path}: {name} pushes release tags and must keep persist-credentials: true"
                    else:
                        assert persist == "false", f"{path}: {name} checkout must set persist-credentials: false"
    return doc


def step_runs(job):
    return "\n".join(str(s.get("run", "")) for s in job.get("steps", []) if isinstance(s, dict))


def check_ci(ci):
    expected = {"classify", "web", "server", "landing", "browser", "desktop", "release-policy", "compose"}
    assert set(ci["jobs"]) == expected | {"gate"}, "All CI jobs must belong to the gate contract"
    assert ci["on"].get("pull_request") == "", "PR gate must have no top-level path filters"
    assert ci["on"]["push"]["branches"] == ["master"]
    dispatch_inputs = ci["on"]["workflow_dispatch"]["inputs"]
    assert dispatch_inputs["candidate_target"]["default"] == "regression"
    assert dispatch_inputs["candidate_target"]["options"] == ["regression", "desktop", "image"]
    assert ci["permissions"] == {"contents": "read"}, "Untrusted PRs cannot receive write authority"
    assert ci["concurrency"]["cancel-in-progress"] == "${{ github.event_name == 'pull_request' }}"
    assert "github.event_name" in ci["concurrency"]["group"]
    assert ci["jobs"]["gate"]["if"] == "always()", "Final gate must run after failure/skip"
    assert set(ci["jobs"]["gate"]["needs"]) == expected, "No required job may escape aggregation"
    gate_name = ci["jobs"]["gate"]["name"]
    assert "regression / gate" in gate_name and "ci / gate" in gate_name and "candidate / {0}" in gate_name

    for job_name in ("web", "browser"):
        job = ci["jobs"][job_name]
        assert "continue-on-error" not in job
        assert all("continue-on-error" not in s for s in job["steps"])

    build = "bun run --filter @notespace/web build"
    web_builds = [s for s in ci["jobs"]["web"]["steps"] if s.get("run") == build]
    browser_builds = [s for s in ci["jobs"]["browser"]["steps"] if s.get("run") == build]
    assert len(web_builds) == len(browser_builds) == 1, "Exactly one web build owner per selection"
    assert web_builds[0]["if"] == "needs.classify.outputs.browser != 'true'"
    assert "if" not in browser_builds[0]

    classify_steps = ci["jobs"]["classify"]["steps"]
    preflight = next(s for s in classify_steps if "ci-plan.test.mjs" in s.get("run", ""))
    planner = next(s for s in classify_steps if s.get("id") == "plan")
    assert "if" not in preflight and classify_steps.index(preflight) < classify_steps.index(planner)
    assert any("smoke-persistence.py --compose-restart" in s.get("run", "") and "if" not in s for s in ci["jobs"]["compose"]["steps"])


def check_desktop_ci(desktop):
    assert "github.workflow" in desktop["concurrency"]["group"], "Reusable desktop CI must not cancel its caller"
    assert desktop["concurrency"]["cancel-in-progress"] == "${{ github.event_name == 'pull_request' }}"

    linux = desktop["jobs"]["check-desktop"]
    assert "inputs.profile == 'regression'" in linux.get("if", ""), (
        "Extended Linux desktop job must not duplicate release-policy on normal PR/master native runs"
    )

    win = desktop["jobs"]["check-desktop-windows"]
    assert "needs" not in win and "if" not in win
    assert win["runs-on"] == "windows-2022"
    assert "continue-on-error" not in win and all("continue-on-error" not in s for s in win["steps"])

    runs = step_runs(win)
    assert "bun run test:desktop:critical" in runs
    assert "bun run test:desktop:native" not in runs, "Avoid duplicate native smoke launch alongside critical journey"
    assert "cargo install tauri-cli" not in runs
    assert runs.index("bun run desktop:icons") < runs.index("tauri-apps/cli")
    assert "assert-windows-pe-subsystem.mjs" in runs
    assert any(
        s.get("env", {}).get("NOTESPACE_NATIVE_REPORT") == "test-results/native-report.json"
        for s in win["steps"]
        if isinstance(s, dict) and "test:desktop:critical" in s.get("run", "")
    )
    assert any(
        s.get("if") == "failure()" and "upload-artifact" in s.get("uses", "")
        for s in win["steps"]
        if isinstance(s, dict)
    )

    for step in win["steps"]:
        if str(step.get("uses", "")).startswith("actions/cache/save@"):
            assert "github.ref == 'refs/heads/master'" in step.get("if", ""), "Only master builds may seed native caches"


def check_publishers():
    reusable_only = [
        "publish-desktop.yml",
        "release-desktop.yml",
    ]
    for filename in reusable_only:
        doc = check_workflow(WORKFLOWS / filename)
        assert list(doc["on"]) == ["workflow_call"], (
            f"{filename}: reusable publisher must be workflow_call-only; release.yml is the sole public entrypoint"
        )
        assert "concurrency" not in doc, (
            f"{filename}: reusable publisher must not declare workflow-level concurrency (owned by release.yml)"
        )

    release = check_workflow(WORKFLOWS / "release.yml")
    assert list(release["on"]) == ["workflow_dispatch"], (
        "release.yml: push/tag/schedule must never auto-publish"
    )

    for filename, job_name, expected_target in [
        ("publish-desktop.yml", "prepare-and-dispatch", "--target desktop"),
        ("release-desktop.yml", "release-credentials-preflight", "--target desktop"),
        ("release.yml", "image", "--target image"),
    ]:
        workflow = check_workflow(WORKFLOWS / filename)
        steps = workflow["jobs"][job_name]["steps"]
        gates = [s for s in steps if "assert-desktop-release-ci.mjs" in s.get("run", "")]
        assert len(gates) == 1 and "if" not in gates[0], f"{filename}: publisher cannot skip exact-master CI gate"
        assert "--collect " in gates[0]["run"] and expected_target in gates[0]["run"], (
            f"{filename}: must verify exact-master {expected_target} lane proofs"
        )

    mode_input = release["on"]["workflow_dispatch"]["inputs"]["mode"]
    assert mode_input["default"] == "preflight"
    assert mode_input["options"] == ["preflight", "desktop-stable", "desktop-stable-resume", "image"]
    assert release["permissions"] == {"contents": "read", "actions": "read"}
    assert release["concurrency"]["cancel-in-progress"] == "false"
    assert "startsWith(inputs.mode, 'desktop-') && 'desktop'" in release["concurrency"]["group"]
    assert release["jobs"]["stable-prepare"]["permissions"] == {"contents": "write", "actions": "read"}
    for name, job in release["jobs"].items():
        if name != "preflight":
            assert job.get("secrets") != "inherit", f"release.yml:{name} must not inherit unrelated secrets"
            assert "needs.preflight.outputs.mode ==" in job.get("if", "")

    stable = check_workflow(WORKFLOWS / "release-desktop.yml")
    assert stable["jobs"]["windows-installer"]["needs"] == "release-credentials-preflight"
    stable_runs = step_runs(stable["jobs"]["windows-installer"])
    assert "--clobber" not in stable_runs, "Releases must remain immutable"
    assert "cargo install tauri-cli" not in stable_runs
    assert stable_runs.index("bun run desktop:icons") < stable_runs.index("tauri-apps/cli")
    assert "assert-windows-pe-subsystem.mjs" in stable_runs
    assert "verify-desktop-msi-upgrade.ps1" in stable_runs
    assert "gh attestation verify" in stable_runs
    assert "https://cyclonedx.org/bom" in stable_runs
    assert stable_runs.index("gh attestation verify") < stable_runs.index("gh release create")
    assert stable_runs.index("https://cyclonedx.org/bom") < stable_runs.index("gh release create")
    stable_steps = stable["jobs"]["windows-installer"]["steps"]
    assert any(str(s.get("uses", "")).startswith("anchore/sbom-action@") for s in stable_steps), (
        "release-desktop.yml must generate a CycloneDX SBOM"
    )
    assert any(
        str(s.get("uses", "")).startswith("actions/attest@") and "sbom-path" in (s.get("with") or {})
        for s in stable_steps
    ), "release-desktop.yml must attest the generated SBOM"
    publish_idx = next(i for i, s in enumerate(stable_steps) if "gh release create" in str(s.get("run", "")))
    post_pub_steps = stable_steps[publish_idx + 1:]
    post_pub_runs = "\n".join(str(s.get("run", "")) for s in post_pub_steps if isinstance(s, dict))
    assert "gh release download" in post_pub_runs, "release-desktop.yml must re-download published assets after gh release create"
    assert "verify-desktop-release-assets.mjs" in post_pub_runs, "release-desktop.yml must run verify-desktop-release-assets.mjs after gh release create"
    assert post_pub_runs.index("gh release download") < post_pub_runs.index("verify-desktop-release-assets.mjs"), (
        "release-desktop.yml must download published assets before running verify-desktop-release-assets.mjs"
    )
    assert "bun run test:desktop:critical" in stable_runs and "bun run test:desktop:native" not in stable_runs

    image_steps = release["jobs"]["image"]["steps"]
    build_steps = [s for s in image_steps if str(s.get("uses", "")).startswith("docker/build-push-action@")]
    assert len(build_steps) == 1, "image job must build candidate exactly once"
    build_with = build_steps[0].get("with", {})
    assert build_with.get("load") == "true", "image job must load candidate image locally before promotion"
    assert build_with.get("push") != "true", "image job must not push directly during candidate build"
    assert build_with.get("tags") == "notespace:release-candidate", "image job must tag candidate build as notespace:release-candidate"

    image_runs = step_runs(release["jobs"]["image"])
    assert "compose.yaml" in image_runs and "--no-build" in image_runs, "image job must verify loaded candidate via compose.yaml --no-build"
    assert "smoke-persistence.py --compose-restart" in image_runs, "image job must run smoke-persistence.py --compose-restart"
    assert "docker push" in image_runs and "docker buildx imagetools create" in image_runs, "image job must push and promote digest"
    login_idx = next(i for i, s in enumerate(image_steps) if str(s.get("uses", "")).startswith("docker/login-action@"))
    build_idx = image_steps.index(build_steps[0])
    smoke_idx = next(i for i, s in enumerate(image_steps) if "smoke-persistence.py --compose-restart" in str(s.get("run", "")))
    promote_idx = next(i for i, s in enumerate(image_steps) if "docker push" in str(s.get("run", "")))
    assert build_idx < smoke_idx < login_idx < promote_idx, (
        "image job must build once, verify loaded candidate with Compose smoke, then login and promote digest"
    )
    assert image_runs.index("docker push") < image_runs.index("docker buildx imagetools create"), (
        "image job must push immutable tag before promoting digest tags"
    )


def check_supply_chain_configs():
    dependabot_path = ROOT / ".github" / "dependabot.yml"
    assert dependabot_path.is_file(), "Missing .github/dependabot.yml"
    dependabot = yaml.load(dependabot_path.read_text(encoding="utf-8"), Loader=NoDuplicateKeys)
    assert dependabot.get("version") == "2", "dependabot.yml must declare version: 2"
    updates = dependabot.get("updates")
    assert isinstance(updates, list) and updates, "dependabot.yml must declare updates"
    ecosystems = set()
    for entry in updates:
        eco = entry.get("package-ecosystem")
        directory = entry.get("directory")
        assert eco and directory, f"Invalid dependabot entry: {entry!r}"
        target_dir = ROOT if directory == "/" else ROOT / directory.lstrip("/")
        assert target_dir.is_dir(), f"dependabot.yml references missing directory {directory!r}"
        ecosystems.add(eco)
    assert {"github-actions", "docker", "bun", "gomod", "cargo"} <= ecosystems, (
        f"dependabot.yml missing required ecosystems: {ecosystems!r}"
    )

    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    from_lines = [line.strip() for line in dockerfile.splitlines() if line.strip().startswith("FROM ")]
    assert len(from_lines) == 3, f"Expected 3 Dockerfile FROM stages, found {len(from_lines)}"
    for line in from_lines:
        assert DOCKER_DIGEST_PINNED.match(line), f"Dockerfile stage must pin sha256 digest: {line!r}"

    audit = check_workflow(WORKFLOWS / "security-audit.yml")
    assert audit["permissions"] == {"contents": "read"}, "security-audit.yml must remain read-only"
    assert set(audit["on"]) == {"schedule", "workflow_dispatch"}, "security-audit.yml must stay scheduled/manual"


def main():
    paths = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))
    assert paths, "No GitHub workflow files found"
    for path in paths:
        check_workflow(path)

    check_ci(check_workflow(WORKFLOWS / "ci.yml"))
    check_desktop_ci(check_workflow(WORKFLOWS / "verify-desktop.yml"))
    check_publishers()
    check_supply_chain_configs()
    print(f"Validated {len(paths)} GitHub Actions workflows")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
