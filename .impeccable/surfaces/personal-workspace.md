# Personal workspace

Mode: Operate. Today is an extension of the existing command center, using the inherited light and Mari-derived midnight themes, official shadcn JSX controls, compact typography, and matte surfaces. No new palette, branding, sidebar, or avatar treatment is introduced.

The user wants Google email/calendar summaries through MCP and Pixelpop tasks/nutrition that can be viewed and managed in Mari. Today occupies the main workspace context through the existing horizontal controls. Overview, Tasks, Nutrition, and Connections organize the work; project selection and the MARI home title remain available.

Prioritize the day's actual source data and clear next actions. Email and calendar summaries identify their source, bounds, freshness, and missing connections. Separate queued/working/cancelled/failed execution from data availability. Preserve useful cached data with an explicit age/error rather than claiming a failed refresh succeeded. No invented thinking, progress, inbox totals, or integrations.

Task and nutrition forms use confirmed upstream results. Preserve inputs on failure, show field and connection errors, and require an explicit delete action. Completed tasks follow Pixelpop's edit/reopen restrictions. Tasks use Pixelpop's shared workspace; nutrition is account-scoped. Distinguish unlogged nutrition from zero, and show only actual supported targets and logs. Do not offer a fake water counter or medical recommendations.

Google uses native Codex MCP without copying OAuth credentials; reads are allowlisted and do not send email or change events. Pixelpop sign-in sends credentials only to Mari's backend, discards the password, and stores its dedicated session privately. Connection status must describe actual checks. All controls remain keyboard accessible, responsive, and legible in both themes.

Verification: one bounded desktop/mobile capture batch for setup and representative synthetic data, plus a material-fix confirmation only if required. Synthetic examples belong only in test fixtures. Live Google checks report status/counts without placing private email content in public review artifacts. No real Pixelpop record writes during QA.
