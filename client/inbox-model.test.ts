import type { PaseoAgent, PaseoAgentHandle } from "@getpaseo/client";
import { describe, expect, it, vi } from "vitest";
import {
  cardsForAgent,
  directActions,
  respondToCard,
  sortCards,
  type InboxCard,
  type Permission,
} from "./inbox-model";

const location = { hostId: "host-a", hostLabel: "Laptop", projectName: "Paseo" };

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
