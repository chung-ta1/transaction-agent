import { describe, it, expect } from "vitest";
import { summarizeBuilderListing } from "../../src/tools/granular/discover.js";

describe("summarizeBuilderListing", () => {
  it("projects a full arrakis builder body down to the summary fields", () => {
    const raw = {
      builders: {
        pageNumber: 0,
        pageSize: 10,
        hasNext: true,
        totalCount: 42,
        results: [
          {
            id: "2b960e1b-07fe-478a-a0dd-5ebd34989731",
            builderType: "TRANSACTION",
            createdAt: 1776722231967,
            updatedAt: 1776722438955,
            address: { street: "123 Main St", city: "New York", state: "NEW_YORK", zip: "10024" },
            agentsInfo: { representationType: "SELLER", teamId: "d712dee8-60cd-4f49-98bc-2e835b59cb85" },
            dealType: "SALE",
            propertyType: "RESIDENTIAL",
            salePrice: { amount: 500000, currency: "USD" },
            grossCommission: { commissionAmount: { amount: 15000, currency: "USD" } },
            yearBuilt: 2020,
            mlsNumber: "ca2233",
            builtFromTransactionId: "5ef18db3-5743-4a3b-a0a1-35512cbf1613",
            // noise that must be stripped:
            participants: new Array(40).fill({ id: "x", yentaId: "y", payment: { amount: { amount: 1 } } }),
            commissionSplits: new Array(10).fill({ participantId: "x", percentage: { string: "10.00%" } }),
            otherParticipants: new Array(5).fill({ id: "x", firstName: "t", lastName: "c" }),
          },
        ],
      },
    };

    const summary = summarizeBuilderListing(raw);

    expect(summary.pageNumber).toBe(0);
    expect(summary.totalCount).toBe(42);
    expect(summary.hasNext).toBe(true);
    expect(summary.results).toHaveLength(1);

    const row = summary.results[0];
    expect(row.id).toBe("2b960e1b-07fe-478a-a0dd-5ebd34989731");
    expect(row.builderType).toBe("TRANSACTION");
    expect(row.representationType).toBe("SELLER");
    expect(row.dealType).toBe("SALE");
    expect(row.salePrice).toEqual({ amount: 500000, currency: "USD" });
    expect(row.grossCommission).toEqual({ amount: 15000, currency: "USD" });
    expect(row.yearBuilt).toBe(2020);
    expect(row.mlsNumber).toBe("ca2233");
    expect(row.teamId).toBe("d712dee8-60cd-4f49-98bc-2e835b59cb85");
    expect(row.address?.oneLine).toBe("123 Main St, New York, NEW_YORK, 10024");

    // The summary MUST NOT carry participants / splits / ledger items — that's the whole point.
    expect(JSON.stringify(summary)).not.toMatch(/participants|commissionSplits|otherParticipants/);
  });

  it("tolerates nullish / stub drafts without throwing", () => {
    const raw = {
      builders: {
        results: [{ id: "abc-123", builderType: "TRANSACTION" }],
      },
    };
    const summary = summarizeBuilderListing(raw);
    const row = summary.results[0];
    expect(row.id).toBe("abc-123");
    expect(row.address).toBeNull();
    expect(row.salePrice).toBeNull();
    expect(row.dealType).toBeNull();
    expect(row.representationType).toBeNull();
    expect(row.yearBuilt).toBeNull();
  });

  it("returns an empty results array when the response is malformed", () => {
    const summary = summarizeBuilderListing({ unexpected: true });
    expect(summary.results).toEqual([]);
  });
});
