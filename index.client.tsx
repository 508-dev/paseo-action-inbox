import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useSettings } from "@getpaseo/plugin/client";
import { Text } from "react-native";
import { InboxScreen } from "./client/inbox-screen";
import { useInbox } from "./client/use-inbox";
import { isUnread } from "./client/inbox-model";
import { inboxPreferences } from "./shared/preferences";

export function InboxItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  const inbox = useInbox();
  const preferences = useSettings(inboxPreferences);
  const count =
    preferences.status === "ready"
      ? inbox.cards.filter((card) => isUnread(card, preferences.values.readTokens)).length
      : 0;
  return (
    <SidebarRow
      icon="Inbox"
      active={currentScreen?.screenId === "inbox"}
      label="Action inbox"
      trailing={
        count > 0 ? (
          <Text
            accessibilityLabel={`${count} unread inbox items`}
            style={{ color: theme.colors.accent, fontSize: 12, paddingHorizontal: 6 }}
          >
            {count > 99 ? "99+" : count}
          </Text>
        ) : undefined
      }
      onPress={() => openScreen({ screenId: "inbox" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "inbox", title: "Action inbox", Component: InboxScreen });
  client.addSidebarHeaderItem({ id: "inbox", title: "Action inbox", Component: InboxItem });
  client.addCommandCenterItem({
    id: "open-inbox",
    title: "Open action inbox",
    icon: "Inbox",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "inbox" });
    },
  });
  return () => {};
}
