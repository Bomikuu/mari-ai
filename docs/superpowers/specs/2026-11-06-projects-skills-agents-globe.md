# Projects, installed skills, Codex profiles, and live globe

The user's next implementation request extends the existing Mari design. They clarified that “create or install agents” means reusable Codex profiles inside Mari, rather than separate runtimes. Preserve JavaScript/JSX, official shadcn primitives, the matte blue-charcoal visual system, local execution, and exact-image approval boundaries.

## Project folders and status

Expose Projects and Scan folder directly in a compact horizontal workspace toolbar. Keep one page without a sidebar. The saved project list is searchable and uncapped, with an internally scrollable table. The project manager separates registration from Folder scan.

Scanning requires an explicitly chosen directory. Bound traversal to depth 3, 500 directories, 100 retained candidates, and four concurrent metadata readers. Skip dependency/VCS/private directories and do not follow directory symlinks. Report limits and per-directory errors. Read actual name/path, framework, package manager and Git information; never run discovered code. Unregistered projects have unknown service health. Registered projects derive status from actual fresh service observations and worker connectivity. Scanning never auto-registers or starts a project.

Allow individual/bulk registration, choosing existing projects, and explicit rescans. Persist at most 12 chosen roots and five scan results in settings. Saved-result status refreshes from current process observations without rescanning another directory.

## Installed skills

Read the effective installed inventory through native Codex app-server `skills/list`, with an explicit choice between Mari's own installed context and the selected project. Profile bindings always resolve in the selected project context. Include scope, enabled state, plugin origin, path, name and description. Query only metadata: no AI turn or API provider. Native ChatGPT authentication and sanitized child environment remain mandatory. Cache per canonical project with a short lifetime and a single in-flight request; explicit refresh forces reload.

Show a searchable/filterable native inventory and readable `SKILL.md` details. Detail endpoints accept inventory IDs, not arbitrary file paths. Bound file sizes, validate canonical identities, and render instructions as escaped text. Inventory failures remain explicit rather than claiming zero installed skills.

## Codex agent profiles

Profiles are configured roles, not live agents. Persist `agentProfiles` in SQLite with name, role, description, instructions, enabled state and selected installed skill IDs. Support create/edit/remove, reviewed built-in Designer/Builder/Reviewer templates, and JSON import/export. Import is at most 64 KiB; reject script, permission, endpoint and unsupported fields. This does not install runtimes or alter the user's global Codex configuration.

Select a profile in command settings or the selected task. Before queuing AI work, resolve an immutable snapshot with instructions, canonical skill files, hashes and native metadata. Validate before mutating task state. Running jobs keep their captured version after profile edits. Before execution, changed/missing skill files fail explicitly. Pass selected skills as documented native `{type:'skill',name,path}` items and role instructions as turn instructions. Mandatory stage, approval, billing and sandbox rules remain last and cannot be overridden. Browser-only stages are unchanged. Runtime labels change only after Codex actually connects.

## Three.js globe

Replace the static 2D core with actual Three.js scene/camera/wireframe geometry and unlit matte styling. Keep the existing wordmark and panel composition. Derive state from selected-context records: offline worker is static; live running jobs/agents resonate subtly; actual running project services rotate slowly; waiting and idle without running services stay static. Do not animate historical or queued executions as current work.

Respect reduced motion. Stop the render loop while hidden or offscreen, cap device pixel ratio at 1.5 and actual rendering at 30 fps, and dispose renderer/materials/geometry/listeners/observers on unmount. WebGL unavailable/context lost has a labeled static fallback. Readable textual state remains available. Load the renderer and secondary resource manager as separate chunks.

## Validation and execution

The user authorized implementation in this session. Deliver scoped backend, project-manager and globe work in parallel, integrate the resource workspace and immutable job snapshots, run consequential Node/HTTP tests and production build, then inspect home/scans/skills/profiles together at desktop and mobile. One material fix batch and one confirmation batch are the visual inspection budget. Test actual globe rotation, reduced-motion/offscreen pause, native inventory, profile creation/template installation/import/export, scoped scan and status behavior. Use only controlled demo/test folders, not an arbitrary directory on the user's computer. Do not approve or implement the pending demo image, commit, merge or deploy.
