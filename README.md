# Crimson Imperium Weekly Quota Bot

Discord bot for tracking weekly Crimson Imperium staff quotas.

## Features
- Event announcements with automatic host/co-host quota credit.
- Any co-host receives quota credit; no special co-host role is required.
- Optional supervisor is recorded but receives no quota credit.
- Event cancellation removes the event from active quota totals.
- Event lock button disables the announcement control.
- Staff can record raid attendance; LOWCOM raid quotas count hosted/co-hosted raids plus recorded attendance.
- Weekly quota views and CSV export.
- Manual weekly reset.
- SQLite persistence.

## Setup
1. Create a Discord application and bot.
2. Enable the Server Members Intent.
3. Invite the bot with bot and applications.commands scopes.
4. Set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, STAFF_ROLE_IDS, and TIMEZONE from .env.example.
5. Run npm install, then npm start.

## Commands
- /event create — announce and record an event.
- /event attend — record a member's attendance.
- /event cancel — cancel an event.
- /quota view — view a member's quota.
- /quota all — list configured quota members.
- /quota export — export the current week's CSV.
- /quota reset — archive the current week and start at zero.
- /duty, /reform, /department — record manual quota credits.

Quota rules are defined in src/config.js.