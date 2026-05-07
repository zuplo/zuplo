# Internal Announcements & Changelog Starter Kit

Headless announcements feed + changelog with MCP-exposed CRUD and orchestrator tools. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/announcements` | List announcements |
| POST | `/announcements` | Create a draft |
| GET | `/announcements/{id}` | Get an announcement |
| PATCH | `/announcements/{id}/schedule` | Move to scheduled |
| PATCH | `/announcements/{id}/publish` | Move to published |
| PATCH | `/announcements/{id}/archive` | Move to archived |
| GET | `/audiences` | List audiences |
| POST | `/audiences` | Create an audience |
| GET | `/acknowledgements` | List acknowledgements |
| POST | `/acknowledgements` | Acknowledge an announcement |
| GET | `/categories` | List categories |
| POST | `/find-unread-critical-for-user` | Orchestrator: unread critical items for a user |
| POST | `/summarize-week-for-team` | Orchestrator: weekly digest grouped by category |
| POST | `/draft-changelog-from-merged-prs` | Orchestrator: draft a release announcement from PR titles |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Announcement` — primary; lifecycle draft -> scheduled -> published -> archived
- `Audience` — slug + name + open `criteria` object
- `Acknowledgement` — join row (announcementId, employeeEmail, acknowledgedAt)
- `Category` — slug + display name + color (catalog)

## MCP tools registered

`list_announcements`, `get_announcement`, `create_announcement`, `schedule_announcement`, `publish_announcement`, `archive_announcement`, `list_audiences`, `create_audience`, `list_acknowledgements`, `acknowledge_announcement`, `list_categories`, `find_unread_critical_for_user`, `summarize_week_for_team`, `draft_changelog_from_merged_prs`. Each appears in both Layer 1 (per-route `mcp: { type: "tool" }`) and Layer 2 (`/mcp` operations array).
