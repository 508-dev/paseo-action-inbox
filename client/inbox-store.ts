import type { PluginHostSummary } from "@getpaseo/plugin/client";
import { sortCards, type InboxCard } from "./inbox-model";

export interface InboxSnapshot {
  cards: InboxCard[];
  errors: string[];
  truncatedHosts: string[];
  loading: boolean;
  refreshing: boolean;
}

export type LoadHost = (
  host: PluginHostSummary,
) => Promise<{ cards: InboxCard[]; truncated: boolean }>;

/** One polling loop shared by the sidebar badge and the inbox screen. */
export function createInboxStore(loadHost: LoadHost) {
  let snapshot: InboxSnapshot = {
    cards: [],
    errors: [],
    truncatedHosts: [],
    loading: true,
    refreshing: false,
  };
  let hosts: readonly PluginHostSummary[] = [];
  let hostKey = "";
  let generation = 0;
  let consumers = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: InboxSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  function refresh(force = false): Promise<void> {
    if (pending && !force) return pending;
    const version = ++generation;
    const online = hosts.filter((host) => host.status === "online");
    publish({ ...snapshot, refreshing: true });
    const task = (async () => {
      const results = await Promise.allSettled(online.map(loadHost));
      if (version !== generation) return;
      const cards: InboxCard[] = [];
      const errors: string[] = [];
      const truncatedHosts: string[] = [];
      results.forEach((result, index) => {
        const host = online[index];
        if (result.status === "rejected") {
          errors.push(
            `${host.label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          );
        } else {
          cards.push(...result.value.cards);
          if (result.value.truncated) truncatedHosts.push(host.label);
        }
      });
      pending = null;
      publish({
        cards: sortCards(cards),
        errors,
        truncatedHosts,
        loading: false,
        refreshing: false,
      });
    })();
    pending = task;
    return task;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    retain(nextHosts: readonly PluginHostSummary[]) {
      consumers += 1;
      const key = JSON.stringify(nextHosts);
      if (key !== hostKey) {
        hostKey = key;
        hosts = nextHosts;
        generation += 1;
        pending = null;
        publish({
          ...snapshot,
          cards: snapshot.cards.filter((card) =>
            hosts.some((host) => host.serverId === card.hostId && host.status === "online"),
          ),
        });
        void refresh();
      } else if (consumers === 1) void refresh();
      timer ??= setInterval(() => void refresh(), 20_000);
      return () => {
        consumers -= 1;
        if (consumers === 0) {
          clearInterval(timer);
          timer = undefined;
          generation += 1;
          pending = null;
        }
      };
    },
  };
}
