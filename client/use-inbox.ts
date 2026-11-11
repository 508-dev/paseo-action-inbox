import { useEffect, useSyncExternalStore } from "react";
import { getPaseoClient, useHosts, type PluginHostSummary } from "@getpaseo/plugin/client";
import { cardsForAgent } from "./inbox-model";
import { createInboxStore } from "./inbox-store";

async function loadHost(host: PluginHostSummary) {
  const paseo = getPaseoClient(host.serverId);
  const cards = [];
  let cursor: string | undefined;
  let pageCount = 0;
  do {
    const result = await paseo.agents.list({
      scope: "active",
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const entry of result.entries)
      cards.push(
        ...cardsForAgent(entry.agent, {
          hostId: host.serverId,
          hostLabel: host.label,
          projectName: entry.project.projectName,
          projectKey: entry.project.projectKey,
        }),
      );
    cursor = result.pageInfo.nextCursor ?? undefined;
    pageCount += 1;
  } while (cursor && pageCount < 5);
  return { cards, truncated: Boolean(cursor) };
}

const store = createInboxStore(loadHost);

export function useInbox() {
  const hosts = useHosts();
  useEffect(() => store.retain(hosts), [hosts]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ...snapshot,
    cards: snapshot.cards.filter((card) =>
      hosts.some((host) => host.serverId === card.hostId && host.status === "online"),
    ),
    hosts,
    refresh: () => store.refresh(true),
  };
}
