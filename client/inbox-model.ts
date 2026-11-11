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
  projectKey: string;
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
  location: { hostId: string; hostLabel: string; projectName: string; projectKey: string },
): InboxCard[] {
  if (agent.archivedAt || agent.background) return [];
  const base = {
    hostId: location.hostId,
    hostLabel: location.hostLabel,
    agentId: agent.id,
    workspaceId: agent.workspaceId ?? null,
    projectName: location.projectName,
    projectKey: JSON.stringify([location.hostId, location.projectKey]),
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

export type ReadTokens = Record<string, string>;

/** Permission revisions ignore unrelated agent updates; repeated completions use attention time. */
export function readToken(card: InboxCard): string {
  const value = JSON.stringify(card.permission ?? [card.updatedAt, card.kind, card.error]);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < value.length; i += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(i))) * 0x100000001b3n);
  }
  return hash.toString(16);
}

export function isUnread(card: InboxCard, read: ReadTokens): boolean {
  return read[card.key] !== readToken(card);
}

export function markRead(read: ReadTokens, cards: InboxCard[]): ReadTokens {
  const next = { ...read };
  for (const card of cards) {
    delete next[card.key];
    next[card.key] = readToken(card);
  }
  // Bound device storage while retaining recently read items, including disconnected hosts.
  return Object.fromEntries(Object.entries(next).slice(-5000));
}

export interface InboxFilters {
  hostId: string | null;
  projectKey: string | null;
  unreadOnly: boolean;
}

export function filterCards(
  cards: InboxCard[],
  filters: InboxFilters,
  read: ReadTokens,
): InboxCard[] {
  return cards.filter(
    (card) =>
      (!filters.hostId || card.hostId === filters.hostId) &&
      (!filters.projectKey || card.projectKey === filters.projectKey) &&
      (!filters.unreadOnly || isUnread(card, read)),
  );
}

export interface QuestionPreview {
  question: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
}

/** Read the provider's structured question payload without exposing transport metadata. */
export function questionPreview(permission: Permission): QuestionPreview[] {
  const input: unknown = permission.input;
  if (
    !input ||
    typeof input !== "object" ||
    !("questions" in input) ||
    !Array.isArray(input.questions)
  )
    return [];
  const result: QuestionPreview[] = [];
  for (const value of input.questions) {
    if (
      !value ||
      typeof value !== "object" ||
      !("question" in value) ||
      typeof value.question !== "string"
    )
      continue;
    const options: QuestionPreview["options"] = [];
    if ("options" in value && Array.isArray(value.options)) {
      for (const option of value.options) {
        if (
          !option ||
          typeof option !== "object" ||
          !("label" in option) ||
          typeof option.label !== "string"
        )
          continue;
        options.push({
          label: option.label,
          description:
            "description" in option && typeof option.description === "string"
              ? option.description
              : undefined,
        });
      }
    }
    result.push({
      question: value.question,
      options,
      multiSelect: "multiSelect" in value && value.multiSelect === true,
    });
  }
  return result;
}

export function permissionSummary(permission: Permission): string {
  if (permission.detail?.type === "shell") return permission.detail.command;
  if (permission.description) return permission.description;
  if (typeof permission.input?.command === "string") return permission.input.command;
  return permission.title || "Open the agent to review this request";
}

export function permissionDetails(permission: Permission): string {
  const fields = {
    kind: permission.kind,
    title: permission.title,
    provider: permission.provider,
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
  if (permissionDetails(request) !== permissionDetails(card.permission)) {
    throw new Error("This request changed. Refresh the inbox and review it again.");
  }
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
