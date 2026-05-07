# Org Chart & People Directory Starter Kit

Headless org chart + directory. See [../CLAUDE.md](../CLAUDE.md) for the conventions every kit follows.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/people` | List people |
| POST | `/people` | Create a person |
| GET | `/people/{id}` | Get a person |
| PATCH | `/people/{id}` | Update a person |
| GET | `/teams` | List teams |
| POST | `/teams` | Create a team |
| GET | `/skills` | List skills |
| POST | `/person-skills` | Attach a skill to a person |
| POST | `/who-reports-to` | Orchestrator: build an N-deep reporting tree |
| POST | `/find-skip-level-reports` | Orchestrator: list skip-level reports |
| POST | `/find-owner-of-team` | Orchestrator: find a team's lead and members |
| POST | `/mcp` | MCP server endpoint |

## Entities

- `Person` — primary; reportedTo via `managerEmail`
- `Team` — name, lead, parent team
- `Skill` — name + category (catalog)
- `PersonSkill` — join row (personEmail, skillName, level 1-5)

## MCP tools registered

`list_people`, `get_person`, `create_person`, `update_person`, `list_teams`, `create_team`, `list_skills`, `add_person_skill`, `who_reports_to`, `find_skip_level_reports`, `find_owner_of_team`. Same operationIds appear in both layers (annotation + `/mcp` operations array).
