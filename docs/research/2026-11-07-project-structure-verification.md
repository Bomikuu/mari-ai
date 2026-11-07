# Project structure and folder selection

The owner approved grouping nested applications as service candidates under
their project, retaining shared packages and independent nested repositories,
and opening a native folder chooser from Browse. This is an extension of the
existing project manager; the established visual system and service controls
remain in place.

## Implementation

`server/project-structure.js` collects project/repository boundaries inside the
explicit root. Root manifests and workspace configuration identify projects;
nested runnable manifests become service candidates, and other package
manifests remain packages. Nested `.git` directories and worktree `.git` files
retain independent project identity. A Git repository without a root manifest
can own child applications. Explicit manual registration can establish a root
even without its own manifest. A scan never climbs above the selected folder.

Discovery retains the three-level, 500-directory and 100-project limits and
adds an explicit limit of 100 nested components. Symlinks, hidden directories,
dependencies and build output remain excluded. Child scripts inherit the root
package manager only when the child has no explicit manager or lockfile.
Frameworks without a known command expose a manual command requirement;
ports, environment-file contents and launch commands are not guessed.

Detected commands retain their actual working directories and appear in the
project's Services view. Configure opens the existing service editor; saving
does not start a job, and first execution retains command/configuration review.
Root scripts are labeled because they may already coordinate child processes.
The Services action and registration keep the manager open for this workflow.
Old saved scans require an explicit rescan before registration, preserving
history without silently creating duplicates. Saved projects are not deleted,
merged or reassigned automatically.

`server/folder-picker.js` starts the preinstalled Linux Zenity chooser with fixed
arguments and a minimal desktop environment. Owner session and CSRF checks
protect the endpoint. Only one chooser is active at a time. Client disconnect
aborts its owned child; cancellation returns no new path and triggers no scan.
If native selection is unavailable, the existing in-app browser lists folders,
offers Home/Parent actions, and keeps manual path entry collapsed and optional.
An empty starting path now loads the default folder correctly.

## Verification

- [Full test result](../../output/project-structure-tests.txt): 234 passed, zero
  failures, skips or cancellations. Twelve new tests cover grouping, mixed
  package managers, missing commands, component limits, worktree boundaries,
  read-only registration, default browsing, native invocation/cancellation,
  single-dialog ownership and endpoint authentication/CSRF.
- [Production build](../../output/project-structure-build.txt): passed. The
  existing Three.js chunk-size warning remains. No dependencies were installed.
- [Firefox check](../../output/playwright/project-structure/checks.json): two
  bounded rounds covered grouped results, fallback folder browsing, cancellation,
  path selection without typing, root registration, exact child command/cwd
  configuration, old-scan rescan and the saved-project Services action. Desktop
  and mobile, dark and light views have no page errors or global horizontal
  overflow. Fixtures were synthetic; no real project service was started.
- [Native dialog probe](../../output/project-structure-native-picker.json): the
  actual Zenity executable opened using the production environment filter and
  remained until its controlled two-second timeout (exit 5). There were no
  display-initialization failures. The test added `--timeout=2` only for this
  probe; production uses cancellation/abort and a bounded execution timeout.
  Manual selection of the owner's real folder is not claimed by this check.
- [JEV classification](../../output/project-structure-jev-result.json): `ready`,
  based solely on the sanitized evidence summary, through the previously
  authorized configured provider. This is a typed judgment, not independent
  functional evidence or proof that a real owner folder has been rescanned.
- [Graph validation](../../graphify-out/application/project-structure-validation.json):
  all 119 JS/JSX source hashes match; all eight original requirements artifacts
  remain unchanged. The local structural graph has 914 nodes, 3,570 edges and
  31 communities. It retains 15 dangling endpoints, eight self-loops and 95
  relation variants collapsed by the undirected representation, recorded in
  its integrity report. The refresh made no external calls and is not a test.

The first parallel test run hit an existing Firefox temporary-profile cleanup
race (`ENOTEMPTY`). Its isolated retry and the subsequent complete 234-test run
passed. The capture implementation and its tests were not modified.

Mari's verified idle backend/worker process was restarted with this update,
preserving project/service settings and Telegram pairing. The owner can now
choose Scan folder → Browse → Scan folder, or Rescan for an older result.
