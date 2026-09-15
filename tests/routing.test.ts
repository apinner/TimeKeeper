import { describe, expect, it } from "vitest";
import { canDecide, resolveApprover } from "@/lib/domain/routing";

describe("approval routing", () => {
  it("routes to the line manager", () => {
    expect(
      resolveApprover({
        requesterId: "emp",
        managerId: "mgr",
        delegations: [],
        onDate: "2026-09-15",
      }),
    ).toEqual({ approverId: "mgr", onBehalfOfId: null, route: "MANAGER" });
  });

  it("falls back to the HR queue when nobody is above them", () => {
    // Just-in-time provisioning means a new starter has no manager yet, and the
    // managing director never will.
    expect(
      resolveApprover({ requesterId: "md", managerId: null, delegations: [], onDate: "2026-09-15" }),
    ).toEqual({ approverId: null, onBehalfOfId: null, route: "HR_QUEUE" });

    expect(
      resolveApprover({ requesterId: "x", managerId: "x", delegations: [], onDate: "2026-09-15" })
        .route,
    ).toBe("HR_QUEUE");
  });

  it("routes to an active delegate and records who they act for", () => {
    const delegations = [
      { managerId: "mgr", delegateId: "deputy", startDate: "2026-09-14", endDate: "2026-09-18" },
    ];

    expect(
      resolveApprover({ requesterId: "emp", managerId: "mgr", delegations, onDate: "2026-09-15" }),
    ).toEqual({ approverId: "deputy", onBehalfOfId: "mgr", route: "DELEGATE" });
  });

  it("ignores a delegation outside its window, which is how cover expires", () => {
    const delegations = [
      { managerId: "mgr", delegateId: "deputy", startDate: "2026-09-14", endDate: "2026-09-18" },
    ];

    expect(
      resolveApprover({ requesterId: "emp", managerId: "mgr", delegations, onDate: "2026-09-21" })
        .route,
    ).toBe("MANAGER");
    expect(
      resolveApprover({ requesterId: "emp", managerId: "mgr", delegations, onDate: "2026-09-13" })
        .route,
    ).toBe("MANAGER");
  });

  it("never routes a request to the person who made it", () => {
    const delegations = [
      { managerId: "mgr", delegateId: "emp", startDate: "2026-09-14", endDate: "2026-09-18" },
    ];

    expect(
      resolveApprover({ requesterId: "emp", managerId: "mgr", delegations, onDate: "2026-09-15" })
        .approverId,
    ).toBe("mgr");
  });
});

describe("who may decide", () => {
  const request = { requesterId: "emp", approverId: "mgr" };

  it("lets the routed approver decide", () => {
    expect(
      canDecide({ ...request, actorId: "mgr", actorRole: "MANAGER", actingForManagerIds: [] }),
    ).toBe(true);
  });

  it("refuses another manager who is not in the chain", () => {
    expect(
      canDecide({ ...request, actorId: "other", actorRole: "MANAGER", actingForManagerIds: [] }),
    ).toBe(false);
  });

  it("lets HR act on anything, so a queue never rots", () => {
    expect(
      canDecide({ ...request, actorId: "hr", actorRole: "HR_ADMIN", actingForManagerIds: [] }),
    ).toBe(true);
    expect(
      canDecide({
        requesterId: "emp",
        approverId: null,
        actorId: "hr",
        actorRole: "HR_ADMIN",
        actingForManagerIds: [],
      }),
    ).toBe(true);
  });

  it("lets an active delegate act for the manager", () => {
    expect(
      canDecide({
        ...request,
        actorId: "deputy",
        actorRole: "MANAGER",
        actingForManagerIds: ["mgr"],
      }),
    ).toBe(true);
  });

  it("never lets anyone approve their own request, whatever their role", () => {
    expect(
      canDecide({
        requesterId: "hr",
        approverId: "hr",
        actorId: "hr",
        actorRole: "SYSADMIN",
        actingForManagerIds: [],
      }),
    ).toBe(false);
  });
});
