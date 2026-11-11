import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { getPaseoClient, useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { inboxPreferences } from "../shared/preferences";
import { filterCards, isUnread, markRead, type InboxCard } from "./inbox-model";
import { InboxButton, InboxFilter } from "./inbox-controls";
import { InboxRow } from "./inbox-row";
import { useInbox } from "./use-inbox";

export function InboxScreen({ theme, layout, navigation }: PluginScreenProps) {
  const inbox = useInbox();
  const preferences = useSettings(inboxPreferences);
  const [hostId, setHostId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const read = preferences.status === "ready" ? preferences.values.readTokens : {};
  const readReady = preferences.status === "ready";
  const unreadCount = inbox.cards.filter((card) => isUnread(card, read)).length;
  const visible = filterCards(inbox.cards, { hostId, projectKey, unreadOnly }, read);
  const scopedUnreadCount = filterCards(
    inbox.cards,
    { hostId, projectKey, unreadOnly: true },
    read,
  ).length;
  const onlineCount = inbox.hosts.filter((host) => host.status === "online").length;
  const projects = [
    ...new Map(
      inbox.cards
        .filter((card) => !hostId || card.hostId === hostId)
        .map((card) => [
          card.projectKey,
          { value: card.projectKey, label: card.projectName, description: card.hostLabel },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const offline = inbox.hosts.filter((host) => host.status !== "online");
  const filtered = hostId !== null || projectKey !== null || unreadOnly;

  async function setRead(cards: InboxCard[], value: boolean) {
    if (preferences.status !== "ready" || preferences.saving) return;
    const next = value
      ? markRead(preferences.values.readTokens, cards)
      : { ...preferences.values.readTokens };
    if (!value) for (const card of cards) delete next[card.key];
    await preferences.save({ readTokens: next }, preferences.revision);
  }

  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 12 : 20 }}
    >
      <View style={{ width: "100%", maxWidth: 880, alignSelf: "center", gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View style={{ gap: 3, flex: 1 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "500" }}>
              {inbox.loading ? "Action inbox" : `${inbox.cards.length} need attention`}
            </Text>
            <Text style={muted}>
              {readReady
                ? `${unreadCount} unread`
                : preferences.status === "loading"
                  ? "Loading read status..."
                  : "Read status unavailable"}{" "}
              · {onlineCount} online {onlineCount === 1 ? "host" : "hosts"}
            </Text>
          </View>
          <InboxButton
            theme={theme}
            compact={layout.compact}
            onPress={() => void inbox.refresh()}
            disabled={inbox.refreshing}
            label="Refresh inbox"
            icon="RefreshCw"
            variant="outline"
          />
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <InboxFilter
              title="Hosts"
              allLabel="All hosts"
              value={hostId}
              options={inbox.hosts.map((host) => ({
                value: host.serverId,
                label: host.label,
                description: host.status === "online" ? "Online" : "Offline or connecting",
              }))}
              onChange={(value) => {
                setHostId(value);
                setProjectKey(null);
              }}
              theme={theme}
              compact={layout.compact}
            />
            <InboxFilter
              title="Projects"
              allLabel="All projects"
              value={projectKey}
              options={projects}
              onChange={setProjectKey}
              theme={theme}
              compact={layout.compact}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            <View style={{ flexDirection: "row", gap: 2 }}>
              <InboxButton
                theme={theme}
                compact={layout.compact}
                selected={!unreadOnly}
                onPress={() => setUnreadOnly(false)}
              >
                All
              </InboxButton>
              <InboxButton
                theme={theme}
                compact={layout.compact}
                selected={unreadOnly}
                disabled={!readReady}
                onPress={() => setUnreadOnly(true)}
              >
                Unread{readReady ? ` ${scopedUnreadCount}` : ""}
              </InboxButton>
            </View>
            <InboxButton
              theme={theme}
              compact={layout.compact}
              disabled={
                !readReady || preferences.saving || !visible.some((card) => isUnread(card, read))
              }
              onPress={() => void setRead(visible, true)}
              label="Mark visible items read"
              icon="CheckCheck"
              variant="outline"
            >
              Mark all read
            </InboxButton>
          </View>
        </View>
        {offline.length ? (
          <Text style={muted}>
            Offline or connecting: {offline.map((host) => host.label).join(", ")}. Showing online
            hosts only.
          </Text>
        ) : null}
        {inbox.truncatedHosts.length ? (
          <Text style={muted}>First 1,000 agents on: {inbox.truncatedHosts.join(", ")}</Text>
        ) : null}
        {inbox.errors.map((error) => (
          <Text key={error} style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
            {error}
          </Text>
        ))}
        {preferences.status === "error" ||
        preferences.status === "invalid" ||
        preferences.saveError ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {preferences.saveError ? "Could not save read status" : "Could not load read status"}
            </Text>
            <InboxButton
              theme={theme}
              compact={layout.compact}
              onPress={() => void preferences.reload()}
            >
              Retry read status
            </InboxButton>
          </View>
        ) : null}
        {filtered ? (
          <Text style={muted}>
            {visible.length} shown
            {hostId
              ? ` · ${inbox.hosts.find((host) => host.serverId === hostId)?.label ?? "Selected host"}`
              : ""}
          </Text>
        ) : null}
        {inbox.loading ? <Text style={muted}>Loading agents...</Text> : null}
        {!inbox.loading && visible.length === 0 ? (
          <View style={{ paddingVertical: 32, gap: 8, alignItems: "center" }}>
            <Text style={muted}>
              {unreadOnly
                ? "No unread items in this view"
                : filtered
                  ? "No items in this view"
                  : "No requests need attention"}
            </Text>
            {filtered ? (
              <InboxButton
                theme={theme}
                compact={layout.compact}
                onPress={() => {
                  setHostId(null);
                  setProjectKey(null);
                  setUnreadOnly(false);
                }}
              >
                Clear filters
              </InboxButton>
            ) : null}
          </View>
        ) : null}
        <View>
          {visible.map((card) => (
            <InboxRow
              key={card.key}
              card={card}
              theme={theme}
              compact={layout.compact}
              unread={readReady ? isUnread(card, read) : null}
              readDisabled={!readReady || preferences.saving}
              onToggleRead={() => void setRead([card], isUnread(card, read))}
              onOpen={
                navigation?.openAgent
                  ? () => {
                      void setRead([card], true);
                      navigation.openAgent({ agentId: card.agentId, serverId: card.hostId });
                    }
                  : undefined
              }
              getAgent={() => getPaseoClient(card.hostId).agents.ref(card.agentId)}
              onRefresh={inbox.refresh}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
