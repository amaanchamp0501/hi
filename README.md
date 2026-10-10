# Event Host — Multi-Server Discord Bot

A configurable event announcement and hosting bot designed to work in **many Discord servers**, with separate settings and quota periods for each server.

## Features
- Per-server host-role and announcement-channel setup.
- Slash-command event creation with a custom event name and announcement details.
- Optional host, co-host, and supervisor fields.
- Join Event button with attendee list storage.
- Lock/unlock events; locking disables joining.
- Host and co-host receive event quota credit; supervisor receives none.
- Per-server configurable quota reset interval, automatic reset, manual reset, quota lookup, and CSV export.
- SQLite storage. Use a host with a persistent disk/volume so settings and event history survive restarts.

## Requirements
- Node.js 20 or newer.
- A Discord application/bot token, kept private.
- A persistent-storage hosting service for long-running production use.

## Run locally
1. Create an application in the Discord Developer Portal and add a bot user.
2. Invite it using the `bot` and `applications.commands` scopes. Give it permission to view/send messages, embed links, read message history, and use application commands in the announcement channel.
3. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
4. Run `npm install`, then `npm start`.

## Commands
- `/setup host-role` — choose which role can create events (Administrators/Manage Server can always manage the bot).
- `/setup announcement-channel` — set the default announcement channel.
- `/setup reset-days` — set automatic quota reset interval from 1 to 30 days.
- `/event create` — post an event announcement.
- `/event lock` and `/event unlock` — lock/unlock an event by ID.
- `/quota view` — check a member's hosted/co-hosted event count.
- `/quota all` — download a CSV of current-period host/co-host totals.
- `/quota reset` — manually start a new quota period for this server.

## Multi-server behaviour
Each server gets its own allowed host role, announcement channel, event records, and reset schedule. Slash commands are registered globally, so they can take a little while to appear after the bot first starts.

## Important deployment note
The SQLite database is stored in `data/events.db`. Deploy to a service with persistent disk storage; otherwise a redeploy or restart may erase server configuration and quota records.
