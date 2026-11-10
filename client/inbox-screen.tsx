import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  getPaseoClient,
  useHosts,
  type PluginHostSummary,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import {
  cardsForAgent,
  directActions,
  permissionDetails,
  respondToCard,
  sortCards,
  type InboxCard,
  type PermissionAction,
} from "./inbox-model";

interface InboxSnapshot {
  cards: InboxCard[];
  errors: string[];
  truncatedHosts: string[];
}

async function loadHost(
  host: PluginHostSummary,
): Promise<{ cards: InboxCard[]; truncated: boolean }> {
  const paseo = getPaseoClient(host.serverId);
  const cards: InboxCard[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  do {
    const result = await paseo.agents.list({
      scope: "active",
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const entry of result.entries) {
      cards.push(
        ...cardsForAgent(entry.agent, {
          hostId: host.serverId,
          hostLabel: host.label,
          projectName: entry.project.projectName,
        }),
      );
    }
    cursor = result.pageInfo.nextCursor ?? undefined;
    pageCount += 1;
  } while (cursor && pageCount < 5);
  return { cards, truncated: Boolean(cursor) };
}

export function InboxScreen({ theme, layout, navigation }: PluginScreenProps) {
  const hosts = useHosts();
  const [snapshot, setSnapshot] = useState<InboxSnapshot>({
    cards: [],
    errors: [],
    truncatedHosts: [],
  });
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const online = hosts.filter((host) => host.status === "online");
    const results = await Promise.allSettled(online.map((host) => loadHost(host)));
    if (version !== refreshVersion.current) return;
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
    setSnapshot({ cards: sortCards(cards), errors, truncatedHosts });
    setLoading(false);
  }, [hosts]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 20_000);
    return () => {
      clearInterval(timer);
      refreshVersion.current += 1;
    };
  }, [refresh]);

  const respond = useCallback(
    async (card: InboxCard, action: PermissionAction) => {
      if (!card.permission || pendingKey) return;
      setPendingKey(card.key);
      setActionError(null);
      try {
        await respondToCard(card, action, () =>
          getPaseoClient(card.hostId).agents.ref(card.agentId),
        );
        await refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingKey(null);
      }
    },
    [pendingKey, refresh],
  );

  const foreground = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted };
  const buttonText = { color: theme.colors.accentForeground, fontWeight: "600" as const };
  const offlineHosts = hosts.filter((host) => host.status !== "online");
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 16 }}
    >
      <View style={{ gap: 6 }}>
        <Text style={[foreground, { fontSize: 22, fontWeight: "700" }]}>Action inbox</Text>
        <Text style={muted}>
          {snapshot.cards.length} item{snapshot.cards.length === 1 ? "" : "s"} across {hosts.length}{" "}
          host
          {hosts.length === 1 ? "" : "s"}
        </Text>
        {offlineHosts.length ? (
          <Text style={muted}>
            Offline or connecting: {offlineHosts.map((host) => host.label).join(", ")}
          </Text>
        ) : null}
        {snapshot.truncatedHosts.length ? (
          <Text style={muted}>
            Showing the first 1,000 agents on: {snapshot.truncatedHosts.join(", ")}
          </Text>
        ) : null}
        {snapshot.errors.map((error) => (
          <Text key={error} style={{ color: theme.colors.statusDanger }}>
            {error}
          </Text>
        ))}
        {actionError ? (
          <Text style={{ color: theme.colors.statusDanger }}>{actionError}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void refresh()}
          style={{ alignSelf: "flex-start", paddingVertical: 8 }}
        >
          <Text style={{ color: theme.colors.accent }}>Refresh</Text>
        </Pressable>
      </View>
      {loading ? <Text style={muted}>Loading agents…</Text> : null}
      {!loading && snapshot.cards.length === 0 ? (
        <Text style={muted}>
          No agent requests or completed work need attention on online hosts.
        </Text>
      ) : null}
      {snapshot.cards.map((card) => {
        const permission = card.permission;
        const detail = permission ? permissionDetails(permission) : null;
        const actions = permission ? directActions(permission) : [];
        const title =
          card.kind === "question"
            ? permission?.title || "Agent question"
            : card.kind === "approval"
              ? permission?.title || "Approval requested"
              : card.kind === "attention"
                ? "Needs input"
                : card.kind === "failed"
                  ? "Failed run"
                  : "Ready to review";
        return (
          <View
            key={card.key}
            style={{
              padding: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.foregroundMuted,
              gap: 8,
            }}
          >
            <Text style={[foreground, { fontSize: 17, fontWeight: "600" }]}>{title}</Text>
            <Text style={muted}>
              {card.hostLabel} · {card.projectName} · {card.agentTitle}
            </Text>
            {card.error && card.kind === "failed" ? (
              <Text style={foreground}>
                {card.error.length <= 2000 ? card.error : `${card.error.slice(0, 2000)}…`}
              </Text>
            ) : null}
            {permission?.description ? (
              <Text style={foreground}>{permission.description}</Text>
            ) : null}
            {detail ? (
              <Text selectable style={muted}>
                {detail.length <= 4000 ? detail : `${detail.slice(0, 4000)}…`}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {actions.map((action) => (
                <Pressable
                  key={action.id}
                  accessibilityRole="button"
                  disabled={pendingKey !== null}
                  onPress={() => void respond(card, action)}
                  style={{
                    backgroundColor:
                      action.behavior === "deny" ? theme.colors.statusDanger : theme.colors.accent,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                  }}
                >
                  <Text style={buttonText}>
                    {pendingKey === card.key ? "Sending…" : action.label}
                  </Text>
                </Pressable>
              ))}
              {navigation?.openAgent ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.openAgent({ agentId: card.agentId, serverId: card.hostId })
                  }
                  style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ color: theme.colors.accent }}>Open agent</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
