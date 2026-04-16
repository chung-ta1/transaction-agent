import { describe, expect, it } from "vitest";
import {
  buyerSellerSchema,
  commissionFractionalPercentSchema,
  locationInfoSchema,
  moneyValueSchema,
  priceAndDatesSchema,
  searchAgentSchema,
  titleInfoSchema,
} from "../../src/types/schemas.js";

describe("schema validators", () => {
  describe("moneyValueSchema", () => {
    it("accepts 2-decimal amounts", () => {
      expect(() => moneyValueSchema.parse({ amount: "20000.00", currency: "USD" })).not.toThrow();
    });

    it("accepts integer amounts", () => {
      expect(() => moneyValueSchema.parse({ amount: "20000", currency: "USD" })).not.toThrow();
    });

    it("rejects scientific notation", () => {
      expect(() => moneyValueSchema.parse({ amount: "2e4", currency: "USD" })).toThrow();
    });

    it("rejects currencies other than USD/CAD", () => {
      expect(() => moneyValueSchema.parse({ amount: "100", currency: "EUR" })).toThrow();
    });
  });

  describe("commissionFractionalPercentSchema", () => {
    it("accepts an amount-only commission", () => {
      expect(() =>
        commissionFractionalPercentSchema.parse({
          commissionAmount: { amount: "20000.00", currency: "USD" },
          commissionPercent: null,
          percentEnabled: false,
        }),
      ).not.toThrow();
    });

    it("accepts a percent-only commission", () => {
      expect(() =>
        commissionFractionalPercentSchema.parse({
          commissionAmount: null,
          commissionPercent: "42.00",
          percentEnabled: true,
        }),
      ).not.toThrow();
    });
  });

  describe("locationInfoSchema", () => {
    it("requires street/city/state/zip", () => {
      expect(() =>
        locationInfoSchema.parse({
          street: "123 Main St",
          city: "New York",
          state: "NEW_YORK",
          zip: "10025",
        }),
      ).not.toThrow();
    });

    it("rejects invalid state enum", () => {
      expect(() =>
        locationInfoSchema.parse({
          street: "123 Main St",
          city: "New York",
          state: "ATLANTIS",
          zip: "10025",
        }),
      ).toThrow();
    });
  });

  describe("priceAndDatesSchema", () => {
    it("accepts the minimum required fields", () => {
      expect(() =>
        priceAndDatesSchema.parse({
          dealType: "SALE",
          salePrice: { amount: "500000.00", currency: "USD" },
          saleCommission: {
            commissionAmount: { amount: "20000.00", currency: "USD" },
            commissionPercent: null,
            percentEnabled: false,
          },
          representationType: "BUYER",
        }),
      ).not.toThrow();
    });

    it("rejects bad date formats", () => {
      expect(() =>
        priceAndDatesSchema.parse({
          dealType: "SALE",
          salePrice: { amount: "500000.00", currency: "USD" },
          saleCommission: {
            commissionAmount: { amount: "20000.00", currency: "USD" },
            commissionPercent: null,
            percentEnabled: false,
          },
          representationType: "BUYER",
          closingDate: "tomorrow",
        }),
      ).toThrow();
    });
  });

  describe("buyerSellerSchema", () => {
    it("requires at least one seller", () => {
      expect(() =>
        buyerSellerSchema.parse({
          buyers: [{ firstName: "Bob", lastName: "Buyer" }],
          sellers: [],
        }),
      ).toThrow();
    });

    it("accepts seller-only (buyers optional)", () => {
      expect(() =>
        buyerSellerSchema.parse({
          sellers: [{ firstName: "Sam", lastName: "Seller" }],
        }),
      ).not.toThrow();
    });
  });

  describe("titleInfoSchema", () => {
    it("accepts useRealTitle=false without titleContactInfo", () => {
      expect(() => titleInfoSchema.parse({ useRealTitle: false })).not.toThrow();
    });

    it("rejects useRealTitle=true without titleContactInfo", () => {
      expect(() => titleInfoSchema.parse({ useRealTitle: true })).toThrow();
    });

    it("accepts useRealTitle=true with full titleContactInfo + manualOrderPlaced", () => {
      expect(() =>
        titleInfoSchema.parse({
          useRealTitle: true,
          manualOrderPlaced: false,
          titleContactInfo: {
            firstName: "Terry",
            lastName: "Title",
            email: "terry@title.com",
            phoneNumber: "5555555555",
            companyName: "Titles R Us",
          },
        }),
      ).not.toThrow();
    });
  });

  describe("searchAgentSchema", () => {
    it("requires at least one lookup field", () => {
      expect(() => searchAgentSchema.parse({ env: "team1" })).toThrow();
    });

    it("accepts a last name only", () => {
      expect(() => searchAgentSchema.parse({ env: "team1", lastName: "Malchizadi" })).not.toThrow();
    });
  });
});
