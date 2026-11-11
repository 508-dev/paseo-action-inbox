# Paseo action inbox

See agent requests and completed work across your connected Paseo hosts in one screen. Scan questions, approvals, failed runs, and finished work in a compact list. Filter by host, project, or unread status, and open the owning agent to act.

The sidebar shows the unread count across online hosts. Reading an item keeps it in the inbox until its underlying request or attention state is resolved.

## Requirements

- Paseo daemon and app **0.16.0-beta.1 or newer**. The plugin uses the beta cross-host client API and typed permission responses.
- The plugin installed on at least one host connected to the app. It reads other online hosts through the app's existing Paseo connections; it does not require installation on every host.

Install from source on a daemon host:

```sh
paseo plugin install git:508-dev/paseo-action-inbox
```

The daemon needs Node and npm on its command path. The manifest installs the locked SDK and validation dependencies, including development dependencies required by the current type-import validator, with lifecycle scripts disabled.

Enable plugins in Paseo's plugin settings if that daemon has them disabled. Plugin code is trusted and runs inside the Paseo app. Review the source before installing it.

## Behavior and limits

- The sidebar and inbox share one refresh every 20 seconds while either is mounted. A manual Refresh action is also available. The plugin reads active, non-background agents from online hosts. Offline hosts are named in the screen; their last known state is not shown as current.
- The inbox reads up to 1,000 active agents per host. A host with more is marked as truncated.
- **Unread** is local to this device and plugin installation ID. New items start unread. Open an agent, mark an item read or unread, or mark the currently filtered items read together. Viewing the inbox alone does not mark items read. A revised permission or later completion becomes unread again. Read markers survive app reloads and retain the most recent 5,000 items; they contain identifiers and content fingerprints, not request bodies. They do not sync between devices.
- **Host and project filters** combine with the Unread filter. Projects with the same name on different hosts remain separate; each project option names its host. The sidebar count always covers all online hosts.
- A **question** shows the question text and a short preview of its choices. **Answer question** opens Paseo's native form for the full structured or freeform answer.
- A **tool approval** starts with a short summary. **Review request** expands the payload; direct provider actions appear only when the entire detail fits within 4,000 characters. The plugin rechecks the pending request and rejects changed payloads before sending a response. Long tool requests, plans, modes, and other permission kinds open in the native agent view for review.
- **Ready to review** means Paseo marked a finished agent as needing attention. It does not mean a pull request or CI check is ready to merge.
- Marking an item read does not clear workspace attention or answer a request. The plugin does not resume failed runs or queue actions for offline hosts. Its unread count is an inbox indicator, not an OS push notification badge.

## Development

```sh
npm ci --include=dev --legacy-peer-deps --ignore-scripts
npm run typecheck
npm run lint
npm run format:check
npm run test
```

The lockfile pins development dependencies. The plugin has no daemon-side network service or background process.
