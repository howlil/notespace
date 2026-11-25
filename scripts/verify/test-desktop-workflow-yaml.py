#!/usr/bin/env python3
"""Single-owner parser and security-invariant validator for GitHub Actions workflows.

Requires PyYAML (installed by CI). BaseLoader avoids YAML 1.1 boolean coercion on `on:`.
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


def step_runs(job):
    return "\n".join(str(s.get("run", "")) for s in job.get("steps", []) if isinstance(s, dict))


def check_ci(ci):
    expected = {"classify", "web", "server", "landing", "browser", "desktop", "release-policy", "compose"}
    assert set(ci["jobs"]) == expected | {"gate"}, "All CI jobs must belong to the gate contract"
    assert ci["on"].get("pull_request") == "", "PR gate must have no top-level path filters"
    assert ci["on"]["push"]["branches"] == ["master"]
    assert ci["permissions"] == {"contents": "read"}, "Untrusted PRs cannot receive write authority"
    assert ci["concurrency"]["cancel-in-progress"] == "${{ github.event_name == 'pull_request' }}"
    assert "github.event_name" in ci["concurrency"]["group"]
    assert ci["jobs"]["gate"]["if"] == "always()", "Final gate must run after failure/skip"
    assert set(ci["jobs"]["gate"]["needs"]) == expected, "No required job may escape aggregation"
    assert "regression / gate" in ci["jobs"]["gate"]["name"] and "ci / gate" in ci["jobs"]["gate"]["name"]

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

    for step in win["steps"]:
        if step.get("uses") == "actions/cache/save@v4":
            assert "github.ref == 'refs/heads/master'" in step.get("if", ""), "Only master builds may seed native caches"


def check_publishers():
    for filename in [
        "auto-desktop-beta.yml",
        "publish-desktop.yml",
        "publish-desktop-beta.yml",
        "release-desktop.yml",
        "release.yml",
        "deploy-cloudflare.yml",
    ]:
        doc = check_workflow(WORKFLOWS / filename)
        events = set(doc["on"])
        assert "workflow_dispatch" in events and events <= {"workflow_dispatch", "workflow_call"}, (
            f"{filename}: push/tag/schedule must never auto-publish"
        )

    auto = check_workflow(WORKFLOWS / "auto-desktop-beta.yml")
    assert list(auto["on"]) == ["workflow_dispatch"]
    assert auto["permissions"] == {"contents": "read", "actions": "read"}
    assert "gh release create" not in step_runs(auto["jobs"]["preflight"])

    for filename, job_name, expected_target in [
        ("auto-desktop-beta.yml", "preflight", "--target desktop"),
        ("publish-desktop.yml", "prepare-and-dispatch", "--target desktop"),
        ("publish-desktop-beta.yml", "windows-msi-beta", "--target desktop"),
        ("release-desktop.yml", "release-credentials-preflight", "--target desktop"),
        ("release.yml", "image", "--target image"),
        ("deploy-cloudflare.yml", "deploy", "--target cloudflare"),
    ]:
        workflow = check_workflow(WORKFLOWS / filename)
        steps = workflow["jobs"][job_name]["steps"]
        gates = [s for s in steps if "assert-desktop-release-ci.mjs" in s.get("run", "")]
        assert len(gates) == 1 and "if" not in gates[0], f"{filename}: publisher cannot skip exact-master CI gate"
        assert "--collect " in gates[0]["run"] and expected_target in gates[0]["run"], (
            f"{filename}: must verify exact-master {expected_target} lane proofs"
        )

    release = check_workflow(WORKFLOWS / "release.yml")
    assert release["on"]["workflow_dispatch"]["inputs"]["mode"]["default"] == "preflight"
    assert release["permissions"] == {"contents": "read", "actions": "read"}
    assert release["concurrency"]["cancel-in-progress"] == "false"
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
    assert stable_runs.index("gh attestation verify") < stable_runs.index("gh release create")
    assert "bun run test:desktop:critical" in stable_runs and "bun run test:desktop:native" not in stable_runs

    beta = check_workflow(WORKFLOWS / "publish-desktop-beta.yml")
    assert beta["concurrency"]["cancel-in-progress"] == "false"
    beta_runs = step_runs(beta["jobs"]["windows-msi-beta"])
    assert "cargo install tauri-cli" not in beta_runs
    assert beta_runs.index("bun run desktop:icons") < beta_runs.index("tauri-apps/cli")
    assert "assert-windows-pe-subsystem.mjs" in beta_runs
    assert "bun run test:desktop:critical" in beta_runs and "bun run test:desktop:native" not in beta_runs
    assert "gh attestation verify" in beta_runs and "gh release create" in beta_runs
    assert "AZURE_CLIENT_SECRET" not in beta_runs


def main():
    paths = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))
    assert paths, "No GitHub workflow files found"
    for path in paths:
        check_workflow(path)

    check_ci(check_workflow(WORKFLOWS / "ci.yml"))
    check_desktop_ci(check_workflow(WORKFLOWS / "verify-desktop.yml"))
    check_publishers()
    print(f"Validated {len(paths)} GitHub Actions workflows")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
