import { describe, expect, it } from "vitest";
import {
  escapeFilterValue,
  groupMembershipFilter,
  isAccountDisabled,
  isMemberOf,
  mapEntryToProfile,
  normaliseUpn,
  userFilter,
} from "@/lib/ldap/attributes";

describe("filter escaping", () => {
  it("neutralises the characters that would rewrite a filter", () => {
    expect(escapeFilterValue("*")).toBe("\\2a");
    expect(escapeFilterValue("(")).toBe("\\28");
    expect(escapeFilterValue(")")).toBe("\\29");
    expect(escapeFilterValue("\\")).toBe("\\5c");
    expect(escapeFilterValue("\0")).toBe("\\00");
  });

  it("defuses an injection attempt in a username", () => {
    // Unescaped, this would turn a lookup for one person into a wildcard match.
    const filter = userFilter("*)(userPrincipalName=*");
    expect(filter).not.toContain("*)(userPrincipalName=*");
    expect(filter).toContain("\\2a\\29\\28userPrincipalName=\\2a");
  });

  it("uses the configured person filter", () => {
    expect(userFilter("a@b.c", { personFilter: "(objectClass=inetOrgPerson)" })).toContain(
      "(objectClass=inetOrgPerson)",
    );
  });

  it("leaves ordinary names untouched", () => {
    expect(escapeFilterValue("alex.pinner@mechatronic.co.uk")).toBe(
      "alex.pinner@mechatronic.co.uk",
    );
  });

  it("escapes the member distinguished name and follows nested groups", () => {
    const filter = groupMembershipFilter("CN=Smith\\, John,OU=Users,DC=example,DC=com");
    expect(filter).toContain("\\5c");
    expect(filter).toContain("1.2.840.113556.1.4.1941");
  });

  it("can ask for direct membership only", () => {
    const filter = groupMembershipFilter("CN=A,DC=x", { nested: false });
    expect(filter).not.toContain("1.2.840.113556.1.4.1941");
    expect(filter).toBe("(member=CN=A,DC=x)");
  });
});

describe("username normalisation", () => {
  const suffix = "@mechatronic.co.uk";

  it("accepts the forms people actually type", () => {
    expect(normaliseUpn("alex.pinner", suffix)).toBe("alex.pinner@mechatronic.co.uk");
    expect(normaliseUpn("alex.pinner@mechatronic.co.uk", suffix)).toBe(
      "alex.pinner@mechatronic.co.uk",
    );
    expect(normaliseUpn("  Alex.Pinner  ", suffix)).toBe("alex.pinner@mechatronic.co.uk");
    expect(normaliseUpn("MECHATRONIC\\alex.pinner", suffix)).toBe(
      "alex.pinner@mechatronic.co.uk",
    );
  });

  it("does not rewrite a different domain someone typed deliberately", () => {
    expect(normaliseUpn("contractor@other.com", suffix)).toBe("contractor@other.com");
  });

  it("copes with no suffix configured, and with nothing typed", () => {
    expect(normaliseUpn("alex.pinner", null)).toBe("alex.pinner");
    expect(normaliseUpn("   ", suffix)).toBe("");
  });

  it("accepts a suffix written without the @", () => {
    expect(normaliseUpn("alex.pinner", "mechatronic.co.uk")).toBe(
      "alex.pinner@mechatronic.co.uk",
    );
  });
});

describe("disabled accounts", () => {
  it("reads the userAccountControl disable bit", () => {
    expect(isAccountDisabled(512)).toBe(false); // normal account
    expect(isAccountDisabled(514)).toBe(true); // normal + disabled
    expect(isAccountDisabled(66048)).toBe(false); // password never expires
    expect(isAccountDisabled(66050)).toBe(true); // ... and disabled
    expect(isAccountDisabled("514")).toBe(true); // AD returns strings
  });

  it("treats a missing or unreadable value as enabled", () => {
    expect(isAccountDisabled(undefined)).toBe(false);
    expect(isAccountDisabled("not a number")).toBe(false);
  });
});

describe("mapping a directory entry", () => {
  const entry = {
    dn: "CN=Alex Pinner,OU=Staff,DC=mechatronic,DC=local",
    userPrincipalName: "Alex.Pinner@mechatronic.co.uk",
    displayName: "Alex Pinner",
    mail: "Alex.Pinner@mechatronic.co.uk",
    department: "Engineering",
    title: "Managing Director",
    manager: "CN=Jane Doe,OU=Staff,DC=mechatronic,DC=local",
    userAccountControl: "512",
    objectGUID: "a1b2c3",
  };

  it("pulls out what the app needs, lowercasing identity", () => {
    const profile = mapEntryToProfile(entry);
    expect(profile).toMatchObject({
      upn: "alex.pinner@mechatronic.co.uk",
      email: "alex.pinner@mechatronic.co.uk",
      displayName: "Alex Pinner",
      department: "Engineering",
      jobTitle: "Managing Director",
      managerDn: "CN=Jane Doe,OU=Staff,DC=mechatronic,DC=local",
      isDisabled: false,
    });
  });

  it("falls back to mail when there is no userPrincipalName", () => {
    const { userPrincipalName: _omitted, ...withoutUpn } = entry;
    expect(mapEntryToProfile(withoutUpn)?.upn).toBe("alex.pinner@mechatronic.co.uk");
  });

  it("returns null for an entry with no identity at all", () => {
    expect(mapEntryToProfile({ dn: "CN=Printer,OU=Devices,DC=x" })).toBeNull();
    expect(mapEntryToProfile({ userPrincipalName: "no-dn@example.com" })).toBeNull();
  });

  it("handles arrays and missing optional attributes", () => {
    const profile = mapEntryToProfile({
      dn: "CN=Part Timer,DC=x",
      userPrincipalName: ["part.timer@mechatronic.co.uk"],
      userAccountControl: "514",
    });
    expect(profile?.upn).toBe("part.timer@mechatronic.co.uk");
    expect(profile?.department).toBeNull();
    expect(profile?.managerDn).toBeNull();
    expect(profile?.isDisabled).toBe(true);
  });
});

describe("memberOf checks", () => {
  const group = "CN=TimeKeeper-Users,OU=Groups,DC=mechatronic,DC=local";

  it("matches regardless of case and spacing", () => {
    expect(isMemberOf([group.toUpperCase()], group)).toBe(true);
    expect(isMemberOf([` ${group} `], group)).toBe(true);
  });

  it("does not match a different group", () => {
    expect(isMemberOf(["CN=Other,OU=Groups,DC=mechatronic,DC=local"], group)).toBe(false);
    expect(isMemberOf([], group)).toBe(false);
    expect(isMemberOf(undefined, group)).toBe(false);
  });
});
