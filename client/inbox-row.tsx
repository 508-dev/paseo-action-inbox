import { useState } from "react";
import { Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import type { PaseoAgentHandle } from "@getpaseo/client";
import {
  directActions,
  permissionDetails,
  permissionSummary,
  questionPreview,
  respondToCard,
  type InboxCard,
  type InboxKind,
  type PermissionAction,
} from "./inbox-model";
import { InboxButton } from "./inbox-controls";

const kinds: Record<InboxKind, { label: string; icon: string; action: string }> = {
  question: { label: "Question", icon: "MessageCircle", action: "Answer question" },
  approval: { label: "Approval", icon: "ShieldCheck", action: "Open agent" },
  attention: { label: "Needs input", icon: "MessageCircle", action: "Open agent" },
  failed: { label: "Failed", icon: "CircleAlert", action: "Inspect failure" },
  review: { label: "Ready to review", icon: "CheckCheck", action: "Review work" },
};

function age(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  return minutes < 1
    ? "Now"
    : minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h`
        : `${Math.floor(minutes / 1440)}d`;
}

export function InboxRow({
  card,
  theme,
  compact,
  unread,
  readDisabled,
  onToggleRead,
  onOpen,
  getAgent,
  onRefresh,
}: {
  card: InboxCard;
  theme: PluginTheme;
  compact: boolean;
  unread: boolean | null;
  readDisabled: boolean;
  onToggleRead(): void;
  onOpen?: () => void;
  getAgent(): Pick<PaseoAgentHandle, "refresh" | "respondToPermission">;
  onRefresh(): Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = kinds[card.kind];
  const questions =
    card.permission && card.kind === "question" ? questionPreview(card.permission) : [];
  const actions = card.permission ? directActions(card.permission) : [];
  const inlineApproval = card.kind === "approval" && actions.length > 0;
  const foreground = { color: theme.colors.foreground, fontSize: 14, lineHeight: 20 };
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 };

  async function respond(action: PermissionAction) {
    if (pending) return;
    setPending(action.id);
    setError(null);
    try {
      await respondToCard(card, action, getAgent);
      await onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      void onRefresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <View
      testID={`inbox-row-${card.agentId}`}
      style={{
        padding: compact ? 12 : 14,
        gap: 6,
        backgroundColor: unread ? theme.colors.surface1 : theme.colors.surface0,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon
          name={kind.icon}
          size={14}
          color={card.kind === "failed" ? theme.colors.statusDanger : theme.colors.foregroundMuted}
        />
        <Text style={muted}>{kind.label}</Text>
        {unread ? <Text style={{ color: theme.colors.accent, fontSize: 11 }}>Unread</Text> : null}
        <Text accessibilityLabel={card.updatedAt} style={[muted, { marginLeft: "auto" }]}>
          {age(card.updatedAt)}
        </Text>
      </View>
      <Text style={[foreground, { fontWeight: unread ? "600" : "400" }]}>{card.agentTitle}</Text>
      <Text numberOfLines={2} style={muted}>
        {card.projectName} · {card.hostLabel}
      </Text>
      {card.kind === "question" && card.permission ? (
        <View style={{ gap: 6, paddingTop: 2 }}>
          <Text numberOfLines={3} style={foreground}>
            {questions[0]?.question ??
              card.permission.description ??
              card.permission.title ??
              "The agent has a question for you"}
          </Text>
          {questions[0]?.options.length ? (
            <View style={{ gap: 4 }}>
              <Text style={muted}>
                {questions[0].multiSelect ? "Choose one or more" : "Choose one"} ·{" "}
                {questions[0].options.length} options
              </Text>
              {questions[0].options.slice(0, 2).map((option, index) => (
                <Text key={index} numberOfLines={2} style={muted}>
                  • {option.label}
                  {option.description ? ` — ${option.description}` : ""}
                </Text>
              ))}
              {questions[0].options.length > 2 ? (
                <Text style={muted}>+{questions[0].options.length - 2} more options</Text>
              ) : null}
            </View>
          ) : null}
          {questions.length > 1 ? (
            <Text style={muted}>+{questions.length - 1} more questions</Text>
          ) : null}
        </View>
      ) : null}
      {card.kind === "approval" && card.permission ? (
        <Text numberOfLines={expanded ? undefined : 2} selectable style={foreground}>
          {permissionSummary(card.permission)}
        </Text>
      ) : null}
      {card.kind === "failed" && card.error ? (
        <Text numberOfLines={3} style={foreground}>
          {card.error}
        </Text>
      ) : null}
      {card.kind === "attention" ? (
        <Text style={foreground}>The agent is waiting for your input</Text>
      ) : null}
      {expanded && card.permission && card.kind === "approval" ? (
        <Text
          selectable
          style={[
            muted,
            {
              fontFamily: "monospace",
              padding: 10,
              backgroundColor: theme.colors.surface2,
              borderRadius: 6,
            },
          ]}
        >
          {permissionDetails(card.permission).slice(0, 4000)}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
          {error}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
          paddingTop: 4,
        }}
      >
        {inlineApproval ? (
          <InboxButton
            theme={theme}
            compact={compact}
            variant={expanded ? "ghost" : "solid"}
            icon="ShieldCheck"
            onPress={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide details" : "Review request"}
          </InboxButton>
        ) : null}
        {expanded
          ? actions.map((action) => (
              <InboxButton
                key={action.id}
                theme={theme}
                compact={compact}
                disabled={pending !== null}
                variant={action.behavior === "allow" ? "solid" : "outline"}
                danger={action.behavior === "deny"}
                icon={action.behavior === "allow" ? "Check" : "X"}
                onPress={() => void respond(action)}
              >
                {pending === action.id ? "Sending..." : action.label}
              </InboxButton>
            ))
          : null}
        {onOpen ? (
          <InboxButton
            theme={theme}
            compact={compact}
            variant={inlineApproval ? "outline" : "solid"}
            icon={inlineApproval ? "ArrowUpRight" : kind.icon}
            onPress={onOpen}
          >
            {card.kind === "approval" && !inlineApproval ? "Review request" : kind.action}
          </InboxButton>
        ) : null}
        <View style={{ marginLeft: "auto" }}>
          <InboxButton
            theme={theme}
            compact={compact}
            disabled={readDisabled}
            label={unread ? "Mark read" : "Mark unread"}
            onPress={onToggleRead}
            icon={unread ? "MailOpen" : "Mail"}
            variant="outline"
          >
            {unread ? "Mark read" : "Mark unread"}
          </InboxButton>
        </View>
      </View>
    </View>
  );
}
