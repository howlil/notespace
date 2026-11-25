# Support

Start with the [documentation index](docs/README.md), then search [existing issues](https://github.com/howlil/notespace/issues).

| Need | Where to go |
| --- | --- |
| Installation or first use | [Getting started](docs/GETTING_STARTED.md) |
| Docker, networking or data location | [Self-hosting](docs/SELF_HOSTING.md) |
| Unexpected behavior or regression | [Bug report](https://github.com/howlil/notespace/issues/new?template=bug_report.yml) |
| Product improvement | [Feature request](https://github.com/howlil/notespace/issues/new?template=feature_request.yml) |
| Vulnerability | [Security policy](SECURITY.md) |

For a bug, include the version or commit, runtime, OS/browser, steps, expected/actual result and sanitized logs. Use synthetic data where possible; do not upload your database, backup archives, personal notes or secrets to public issues.

For Docker startup problems, check `docker compose logs -f`, verify that the data volume is mounted and confirm the configured address/port. For desktop update or installer questions, identify the exact release asset and channel. Back up data before recovery actions.

Support is best effort through the public repository; there is no guaranteed response time. Please keep follow-ups in the same issue.
