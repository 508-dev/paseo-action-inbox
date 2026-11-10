# Paseo action inbox

See agent requests and completed work across your connected Paseo hosts in one screen. The inbox groups pending questions, tool approvals, failed runs, and finished work that needs review. Cards link directly to the owning agent. Tool approval cards also provide direct actions when the entire request detail fits on the card; the plugin rechecks the pending request before sending a response.

## Requirements

- Paseo daemon and app **0.16.0-beta.1 or newer**. The plugin uses the beta cross-host client API and typed permission responses.
- The plugin installed on at least one host connected to the app. It reads other online hosts through the app's existing Paseo connections; it does not require installation on every host.

Install from source on a daemon host:

```sh
paseo plugin install git:508-dev/paseo-action-inbox
```

Enable plugins in Paseo's plugin settings if that daemon has them disabled. Plugin code is trusted and runs inside the Paseo app. Review the source before installing it.

## Behavior and limits

- The inbox refreshes every 20 seconds while open and offers a manual Refresh action. It reads active, non-background agents from online hosts. Offline hosts are named in the screen; their last known state is not shown as current.
- The inbox reads up to 1,000 active agents per host. A host with more is marked as truncated.
- A **question** opens the native agent view for its structured or freeform answer. The plugin does not attempt to reproduce the native question form.
- A **tool approval** shows direct actions only when its full request detail is at most 4,000 characters. Long tool requests, plans, modes, and other permission kinds open in the native agent view for review.
- **Ready to review** means Paseo marked a finished agent as needing attention. It does not mean a pull request or CI check is ready to merge.
- The plugin does not mark items read, clear workspace attention, resume failed runs, or queue actions for offline hosts.

## Development

```sh
npm ci --legacy-peer-deps --ignore-scripts
npm run typecheck
npm run lint
npm run format:check
npm run test
```

The lockfile pins development dependencies. The plugin has no daemon-side network service or background process.
