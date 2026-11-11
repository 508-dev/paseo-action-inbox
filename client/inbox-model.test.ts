import type { PaseoAgent, PaseoAgentHandle } from "@getpaseo/client";
import { describe, expect, it, vi } from "vitest";
import {
  cardsForAgent,
  directActions,
  filterCards,
  isUnread,
  markRead,
  questionPreview,
  respondToCard,
  sortCards,
  type InboxCard,
  type Permission,
} from "./inbox-model";
import { createInboxStore } from "./inbox-store";

const location = {
  hostId: "host-a",
  hostLabel: "Laptop",
  projectName: "Paseo",
  projectKey: "paseo",
};

function agent(overrides: Partial<PaseoAgent> = {}): PaseoAgent {
  return {
    id: "agent-a",
    provider: "codex",
    title: "Fix the app",
    workspaceId: "workspace-a",
    status: "idle",
    updatedAt: "2026-11-10T12:00:00Z",
    pendingPermissions: [],
    requiresAttention: false,
    attentionReason: null,
    ...overrides,
  } as PaseoAgent;
}

function permission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: "request-a",
    provider: "codex",
    name: "run_command",
    kind: "tool",
    title: "Run tests",
    input: { command: "npm test" },
    ...overrides,
  } as Permission;
}

describe("cross-host inbox classification", () => {
  it("shows individual questions and approvals before a generic attention item", () => {
    const cards = cardsForAgent(
      agent({
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissions: [permission(), permission({ id: "request-b", kind: "question" })],
      }),
      location,
    );
    expect(cards.map((card) => card.kind)).toEqual(["approval", "question"]);
    expect(cards.map((card) => card.key)).toEqual([
      "host-a:agent-a:request-a",
      "host-a:agent-a:request-b",
    ]);
  });

  it("includes completed and failed agents, but excludes archived and background work", () => {
    expect(
      cardsForAgent(agent({ requiresAttention: true, attentionReason: "finished" }), location)[0]
        ?.kind,
    ).toBe("review");
    expect(cardsForAgent(agent({ status: "error" }), location)[0]?.kind).toBe("failed");
    expect(
      cardsForAgent(agent({ requiresAttention: true, attentionReason: "permission" }), location)[0]
        ?.kind,
    ).toBe("attention");
    expect(cardsForAgent(agent({ archivedAt: "2026-11-10T12:01:00Z" }), location)).toEqual([]);
    expect(cardsForAgent(agent({ background: true }), location)).toEqual([]);
  });

  it("sorts decisions before failures and completed work", () => {
    const review = cardsForAgent(
      agent({ requiresAttention: true, attentionReason: "finished" }),
      location,
    );
    const failed = cardsForAgent(agent({ status: "error" }), location);
    const question = cardsForAgent(
      agent({ pendingPermissions: [permission({ kind: "question" })] }),
      location,
    );
    expect(sortCards([...review, ...failed, ...question]).map((card) => card.kind)).toEqual([
      "question",
      "failed",
      "review",
    ]);
  });
});

describe("direct permission actions", () => {
  it("rejects a request whose content changed after the user reviewed it", async () => {
    const original = permission();
    const card = cardsForAgent(agent({ pendingPermissions: [original] }), location)[0];
    const respondToPermission = vi.fn();
    await expect(
      respondToCard(
        card,
        directActions(original)[1],
        () =>
          ({
            refresh: async () => ({
              agent: agent({
                pendingPermissions: [permission({ input: { command: "different command" } })],
              }),
              project: null,
            }),
            respondToPermission,
          }) as Pick<PaseoAgentHandle, "refresh" | "respondToPermission">,
      ),
    ).rejects.toThrow("request changed");
    expect(respondToPermission).not.toHaveBeenCalled();
  });
  it("offers the same default tool decisions as Paseo's agent view", () => {
    expect(directActions(permission()).map(({ id, behavior }) => ({ id, behavior }))).toEqual([
      { id: "reject", behavior: "deny" },
      { id: "accept", behavior: "allow" },
    ]);
  });

  it("uses provider actions and keeps questions or lengthy requests in the native agent view", () => {
    expect(
      directActions(
        permission({ actions: [{ id: "once", label: "Allow once", behavior: "allow" }] }),
      ),
    ).toEqual([{ id: "once", label: "Allow once", behavior: "allow", variant: undefined }]);
    expect(directActions(permission({ kind: "question" }))).toEqual([]);
    expect(
      directActions(permission({ detail: { text: "x".repeat(5000) } as Permission["detail"] })),
    ).toEqual([]);
  });

  it("checks that a request is still pending before responding", async () => {
    const card = cardsForAgent(
      agent({ pendingPermissions: [permission()] }),
      location,
    )[0] as InboxCard;
    const respondToPermission = vi.fn(async () => {});
    const refresh = vi.fn(async () => ({
      agent: agent({ pendingPermissions: [] }),
      project: null,
    }));
    const getAgent = () =>
      ({ refresh, respondToPermission }) as Pick<
        PaseoAgentHandle,
        "refresh" | "respondToPermission"
      >;
    await expect(respondToCard(card, directActions(permission())[1], getAgent)).rejects.toThrow(
      "no longer pending",
    );
    expect(respondToPermission).not.toHaveBeenCalled();
  });

  it("sends the selected backend action after a fresh permission check", async () => {
    const request = permission({
      actions: [{ id: "once", label: "Allow once", behavior: "allow" }],
    });
    const card = cardsForAgent(agent({ pendingPermissions: [request] }), location)[0] as InboxCard;
    const respondToPermission = vi.fn(async () => {});
    const getAgent = () =>
      ({
        refresh: async () => ({ agent: agent({ pendingPermissions: [request] }), project: null }),
        respondToPermission,
      }) as Pick<PaseoAgentHandle, "refresh" | "respondToPermission">;
    await respondToCard(card, directActions(request)[0], getAgent);
    expect(respondToPermission).toHaveBeenCalledWith({
      requestId: "request-a",
      response: { behavior: "allow", selectedActionId: "once" },
    });
  });
});

describe("inbox read state and filters", () => {
  it("keeps an approval read across refreshes and saved-state reloads, but marks changed content unread", () => {
    const original = cardsForAgent(agent({ pendingPermissions: [permission()] }), location)[0];
    expect(isUnread(original, {})).toBe(true);
    const saved = JSON.parse(JSON.stringify(markRead({}, [original])));
    const refreshed = { ...original, updatedAt: "2026-11-10T13:00:00Z" };
    expect(isUnread(refreshed, saved)).toBe(false);
    const changed = {
      ...refreshed,
      permission: permission({ input: { command: "npm run build" } }),
    };
    expect(isUnread(changed, saved)).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("npm test");
  });

  it("treats a later completion as unread without removing a read item from the inbox", () => {
    const card = cardsForAgent(
      agent({
        requiresAttention: true,
        attentionReason: "finished",
        attentionTimestamp: "2026-11-10T12:00:00Z",
      }),
      location,
    )[0];
    const saved = markRead({}, [card]);
    expect(
      filterCards([card], { hostId: null, projectKey: null, unreadOnly: false }, saved),
    ).toHaveLength(1);
    expect(
      filterCards([card], { hostId: null, projectKey: null, unreadOnly: true }, saved),
    ).toEqual([]);
    expect(isUnread({ ...card, updatedAt: "2026-11-10T13:00:00Z" }, saved)).toBe(true);
  });

  it("combines host, project and unread filters without merging identically named projects", () => {
    const a = cardsForAgent(agent({ status: "error" }), location)[0];
    const b = cardsForAgent(agent({ status: "error" }), { ...location, hostId: "host-b" })[0];
    expect(a.projectKey).not.toBe(b.projectKey);
    const filters = { hostId: "host-a", projectKey: a.projectKey, unreadOnly: true };
    const visible = filterCards([a, b], filters, {});
    expect(visible).toEqual([a]);
    const saved = markRead({}, visible);
    expect(isUnread(a, saved)).toBe(false);
    expect(isUnread(b, saved)).toBe(true);
  });

  it("reads question text and choices without leaking metadata into the preview", () => {
    expect(
      questionPreview(
        permission({
          kind: "question",
          metadata: { internal: "hidden" },
          input: {
            questions: [
              {
                question: "Which layout?",
                header: "Layout",
                options: [{ label: "Compact", description: "More rows" }, { label: "Roomy" }],
                multiSelect: false,
              },
            ],
          },
        }),
      ),
    ).toEqual([
      {
        question: "Which layout?",
        options: [
          { label: "Compact", description: "More rows" },
          { label: "Roomy", description: undefined },
        ],
        multiSelect: false,
      },
    ]);
    expect(
      questionPreview(
        permission({ kind: "question", input: { questions: [null, { unexpected: true }] } }),
      ),
    ).toEqual([]);
  });
});

describe("shared inbox observation", () => {
  const hosts = [{ serverId: "host-a", label: "Laptop", status: "online" as const }];

  it("shares one polling loop between sidebar and screen and stops when both unmount", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => ({ cards: [], truncated: false }));
      const store = createInboxStore(load);
      const sidebar = store.retain(hosts);
      const screen = store.retain(hosts);
      await store.refresh();
      expect(load).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(load).toHaveBeenCalledTimes(2);
      sidebar();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(load).toHaveBeenCalledTimes(3);
      screen();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(load).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards a pending host response after that host disconnects", async () => {
    let resolve!: (result: { cards: InboxCard[]; truncated: boolean }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ cards: InboxCard[]; truncated: boolean }>((done) => {
          resolve = done;
        }),
    );
    const store = createInboxStore(load);
    const first = store.retain(hosts);
    const second = store.retain([{ ...hosts[0], status: "offline" }]);
    await store.refresh();
    resolve({ cards: cardsForAgent(agent({ status: "error" }), location), truncated: false });
    await Promise.resolve();
    expect(store.getSnapshot().cards).toEqual([]);
    first();
    second();
  });

  it("a forced refresh after an action supersedes an older pending read", async () => {
    const resolvers: ((result: { cards: InboxCard[]; truncated: boolean }) => void)[] = [];
    const store = createInboxStore(() => new Promise((resolve) => resolvers.push(resolve)));
    const release = store.retain(hosts);
    const newest = store.refresh(true);
    resolvers[1]({ cards: [], truncated: false });
    await newest;
    resolvers[0]({ cards: cardsForAgent(agent({ status: "error" }), location), truncated: false });
    await Promise.resolve();
    expect(store.getSnapshot().cards).toEqual([]);
    release();
  });
});
