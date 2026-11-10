import type { PaseoAgent, PaseoAgentHandle } from "@getpaseo/client";

export type InboxKind = "question" | "approval" | "attention" | "failed" | "review";
export type Permission = PaseoAgent["pendingPermissions"][number];

export interface InboxCard {
  key: string;
  hostId: string;
  hostLabel: string;
  agentId: string;
  workspaceId: string | null;
  projectName: string;
  agentTitle: string;
  kind: InboxKind;
  updatedAt: string;
  error: string | null;
  permission: Permission | null;
}

export interface PermissionAction {
  id: string;
  label: string;
  behavior: "allow" | "deny";
  variant?: "primary" | "secondary" | "danger";
}

export function cardsForAgent(
  agent: PaseoAgent,
  location: { hostId: string; hostLabel: string; projectName: string },
): InboxCard[] {
  if (agent.archivedAt || agent.background) return [];
  const base = {
    hostId: location.hostId,
    hostLabel: location.hostLabel,
    agentId: agent.id,
    workspaceId: agent.workspaceId ?? null,
    projectName: location.projectName,
    agentTitle: agent.title || agent.provider,
    updatedAt: agent.attentionTimestamp ?? agent.updatedAt,
    error: agent.lastError ?? null,
  };
  if (agent.pendingPermissions.length > 0) {
    return agent.pendingPermissions.map((permission) => ({
      ...base,
      key: `${location.hostId}:${agent.id}:${permission.id}`,
      kind: permission.kind === "question" ? "question" : "approval",
      permission,
    }));
  }
  if (agent.requiresAttention && agent.attentionReason === "permission") {
    return [
      {
        ...base,
        key: `${location.hostId}:${agent.id}:attention`,
        kind: "attention",
        permission: null,
      },
    ];
  }
  if (agent.attentionReason === "error" || agent.status === "error") {
    return [
      { ...base, key: `${location.hostId}:${agent.id}:failed`, kind: "failed", permission: null },
    ];
  }
  if (agent.requiresAttention && agent.attentionReason === "finished") {
    return [
      { ...base, key: `${location.hostId}:${agent.id}:review`, kind: "review", permission: null },
    ];
  }
  return [];
}

export function permissionDetails(permission: Permission): string {
  const fields = {
    name: permission.name,
    description: permission.description,
    input: permission.input,
    detail: permission.detail,
    suggestions: permission.suggestions,
    actions: permission.actions,
    metadata: permission.metadata,
  };
  return JSON.stringify(fields, null, 2);
}

/** Direct responses require all request details to fit on the card. */
export function directActions(permission: Permission): PermissionAction[] {
  if (permission.kind !== "tool" || permissionDetails(permission).length > 4000) return [];
  if (permission.actions?.length) {
    return permission.actions.map(({ id, label, behavior, variant }) => ({
      id,
      label,
      behavior,
      variant,
    }));
  }
  return [
    { id: "reject", label: "Deny", behavior: "deny", variant: "danger" },
    { id: "accept", label: "Allow", behavior: "allow", variant: "primary" },
  ];
}

/** Re-read the permission before a mutation so a stale inbox card cannot answer a newer request. */
export async function respondToCard(
  card: InboxCard,
  action: PermissionAction,
  getAgent: () => Pick<PaseoAgentHandle, "refresh" | "respondToPermission">,
): Promise<void> {
  if (!card.permission) throw new Error("This card has no permission request");
  const agent = getAgent();
  const current = await agent.refresh();
  const request = current?.agent.pendingPermissions.find(
    (entry) => entry.id === card.permission?.id,
  );
  if (!request) throw new Error("This request is no longer pending");
  const allowed = directActions(request).find(
    (candidate) => candidate.id === action.id && candidate.behavior === action.behavior,
  );
  if (!allowed) throw new Error("This request now needs review in the agent view");
  await agent.respondToPermission({
    requestId: request.id,
    response:
      action.behavior === "allow"
        ? { behavior: "allow", selectedActionId: action.id }
        : { behavior: "deny", selectedActionId: action.id, message: "Denied by user" },
  });
}

const priorities: Record<InboxKind, number> = {
  question: 0,
  approval: 1,
  attention: 2,
  failed: 3,
  review: 4,
};

export function sortCards(cards: InboxCard[]): InboxCard[] {
  return [...cards].sort(
    (a, b) =>
      priorities[a.kind] - priorities[b.kind] ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.key.localeCompare(b.key),
  );
}
