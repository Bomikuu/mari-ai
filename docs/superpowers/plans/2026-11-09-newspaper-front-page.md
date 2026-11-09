# Compact Mari Daily implementation

1. Implement measured broadsheet typesetting with a one-page preference and readable two-page fallback. Keep bounded full stories and market/source metadata.
2. Add optional, bounded publisher-image ingestion and private artifacts. Attach image metadata on the host, outside model output.
3. Render the shared layout in React, provide a readable mobile view, preserve legacy saved editions, and update print/page-count controls.
4. Reflow today's saved edition with no model call; preserve its former PDF and source times. Update the existing morning automation's presentation instruction.
5. Run meaningful layout/image/worker checks, existing test suite and build. Inspect PDF plus Firefox desktop/mobile/light/dark in one batch, allow one scoped correction batch and confirmation, then stop. Refresh the application graph and record evidence.

Scope is the newspaper. Preserve unrelated Markets/X work, project services, credentials, schedules and agent history. No extra AI review or delegated agents are needed.
