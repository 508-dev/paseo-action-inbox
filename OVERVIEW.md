# Action inbox

See pending agent questions, tool approvals, failed runs, and finished work needing review across your online Paseo hosts. Filter the compact list by host, project, or unread status. The sidebar shows the total unread count, and each item opens its owning agent.

Requires Paseo 0.16.0-beta.1 or newer on the daemon and app, plus Node and npm on the daemon for Git installation. Preparation installs locked SDK and validation dependencies with lifecycle scripts disabled. Install the plugin on one connected host; it reads the app's existing connections to other hosts. The sidebar and screen share a refresh every 20 seconds while either is mounted, reading up to 1,000 active agents per host.

Read status stays on this device, survives app reloads, and retains the most recent 5,000 read markers. Open an agent or use the read controls to mark items. Revised requests and new completions become unread again. Reading does not clear attention or answer a request.

Questions show readable text and choices, then open Paseo's native answer form. Tool requests reveal their full details before offering direct provider actions, with a fresh check that the request has not changed. Long and non-tool requests open the native agent view. Offline hosts are named without presenting stale state as current. The plugin does not resume failed runs or queue offline actions.
