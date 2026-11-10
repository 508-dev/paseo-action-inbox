import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { InboxScreen } from "./client/inbox-screen";

function InboxItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Inbox"
      active={currentScreen?.screenId === "inbox"}
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
