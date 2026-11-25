# Security policy

## Reporting vulnerabilities

Do not publish exploit details, credentials, private notes, databases or proof-of-concept files in public issues or pull requests.

Use the repository's [Security advisories page](https://github.com/howlil/notespace/security/advisories) and choose **Report a vulnerability** if private reporting is enabled. If the option is unavailable, open a minimal issue requesting a private security contact without revealing vulnerability details, or contact the [maintainer](https://github.com/howlil) through an available private channel.

Include the affected version/commit and runtime (desktop or self-hosted), impact, prerequisites, minimal reproduction using synthetic data, and any mitigation you know. Redact all personal data and secrets. Coordinate disclosure with the maintainer; no fixed response SLA or bounty is promised.

## Version scope

Report issues in any released version or the current default branch. Where practical, reproduce on the latest applicable release; no long-term support or backport schedule is guaranteed.

## Deployment boundary

Notespace is single-owner software. Application HTTP Basic authentication is optional on trusted private networks; use a strong owner password and HTTPS before remote exposure. The health endpoint is intentionally unauthenticated. Do not treat the app as a multi-tenant security boundary. Keep backups and restrict access to data volumes and installer/update sources.

See [self-hosting](docs/SELF_HOSTING.md) and [desktop distribution](docs/DESKTOP_FIRST_RELEASE.md) for deployment and signing details. Ordinary bugs and setup questions belong in [GitHub Issues](https://github.com/howlil/notespace/issues).
