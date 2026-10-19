# Shared repository standards

This is the reference policy for `jft-app` and a future matching change in `jft-harness`. Copy the common tooling and documentation conventions; preserve each project's product behavior and architecture. Changes to this app do not configure or integrate the harness.

## 1. One verification command

Use `npm run check` locally and in CI after `npm ci`. [CONTRIBUTING.md](../CONTRIBUTING.md#commands) owns the app's command descriptions. Next.js 16's build already checks TypeScript; do not run a second type check afterward. The harness copy should include its standalone type check because it has no equivalent build.

The app additionally runs Playwright after `check`; the harness need not copy UI tests or Next.js lint presets. Both default suites use fictional data and require no live service credentials.

## 2. Formatting

Copy `.prettierrc.json`, `.prettierignore`, and `.editorconfig`, plus the exact Prettier version and format scripts. The configuration files own formatting values; do not maintain separate descriptions of those values in multiple guides. Adjust ignore lists for each project's generated files. No Tailwind-specific formatter plugin is part of the shared baseline.

## 3. PR template

Copy [.github/pull_request_template.md](../.github/pull_request_template.md) and the Conventional Commits workflow. [CONTRIBUTING.md](../CONTRIBUTING.md#pull-requests-and-merging) owns the authoring instructions; the template owns section prompts.

## 4. Repository settings

These are desired configuration decisions, **not settings enforced by repository files**. This document is not a live report of GitHub enforcement. Inspect actual repository settings/rules before claiming a policy is active; do not infer enforcement from a merged PR or committed workflow.

After the workflows have registered successful checks, configure and verify the following policy in each repository:

| Setting                   | Decision                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| Default branch            | `main`                                                                        |
| Merge methods             | Squash only; disable merge commits and rebase merging                         |
| Squash commit title       | PR title                                                                      |
| Squash commit description | PR body                                                                       |
| Automatic branch deletion | Enabled                                                                       |
| Auto-merge                | Disabled; a maintainer explicitly merges                                      |
| Main branch rule          | Require a pull request, resolved conversations, and passing checks            |
| Required checks           | `Verify`, `Conventional PR title`, `Dependency Review`, `CodeQL`              |
| Branch freshness          | Require the branch to be up to date before merging                            |
| Review approvals          | Zero required, to allow a solo maintainer; request peer review when available |
| Force pushes and deletion | Block on `main`                                                               |
| Rule bypass               | No routine bypass actors; maintainers follow the same checks                  |

Select the check runs emitted by the corresponding GitHub Actions workflows, rather than similarly named checks from another source. Confirm their actual names in GitHub before configuring the rule. Require checks only after their first successful run so initialization is not blocked by checks that do not exist yet.

Dependency Review requires the dependency graph. If GitHub reports it unavailable, enable it under Settings → Security → Advanced Security (the `settings/security_analysis` page), then rerun. A subsequent vulnerability finding must be resolved rather than treated as the same setup error.

Enable the dependency graph, Dependabot alerts, and Dependabot security updates. Confirm Actions and code scanning are enabled and that CodeQL uses the committed workflow rather than duplicate default setup. Repository rules and feature availability must be verified in GitHub; no branch-protection or security-setting change is claimed here.

## 5. Contributor instructions

Use a root `CONTRIBUTING.md` with Setup, Commands, Organization and documentation, Testing, Pull requests and merging, and Dependency maintenance. README remains product-focused and links to contributor details. Keep `docs/ARCHITECTURE.md` project-specific.

## 6. Data vocabulary

Adopt `docs/DATA_GLOSSARY.md` in both repositories. Distinguish readings, drafts, shares, journal entries, fictional fixtures, and traces. Document where data lives, when it leaves the device, and how it is removed. Examples and tests use fictional content. Do not introduce a shared data package until an actual integration requires one.

## 7. Dependency and security maintenance

Use `.github/dependabot.yml` for npm and GitHub Actions, weekly on Monday at 09:00 America/Chicago. Group minor and patch updates within each ecosystem; leave major versions separate. Limit scheduled open PRs to five per ecosystem. Use `chore(deps)` and `ci(deps)` prefixes so update titles satisfy Conventional Commits.

Enable security updates through repository settings; security updates need not wait for the weekly version-update schedule. Review them promptly and merge manually after checks pass.

Dependency Review blocks newly introduced high/critical known vulnerabilities on PRs. CodeQL runs on PRs, pushes to `main`, and Mondays at 08:00 UTC. Keep permissions limited to each workflow's needs. Automated scanning does not prove data privacy, runtime correctness, or the absence of vulnerabilities.

## Copying to jft-harness

1. Copy the formatter/editor configs, Prettier dependency version, format scripts, PR template, and dependency-update configuration. Add harness output directories to `.prettierignore`.
2. Add the harness-specific `check` sequence from section 1 and invoke it from a CI job named `Verify`.
3. Adapt `CONTRIBUTING.md` setup and commands for the existing CLI. Copy the glossary and this policy, updating actual enforcement status.
4. Retain its existing CodeQL and Dependency Review behavior, aligning job names and schedules with these files. Retain its conventional title validator.
5. Apply and verify the repository settings only after the checks exist. Do not copy Next.js commands, UI structure, or app persistence behavior into the harness.
