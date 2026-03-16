import { describe, it, expect } from "vitest";
import { parseCurrencyLikeValue } from "@/lib/payment-utils";

describe("parseCurrencyLikeValue", () => {
  it("interpreta puntos como separadores de miles", () => {
    expect(parseCurrencyLikeValue("100.000")).toBe(100000);
    expect(parseCurrencyLikeValue("22.400.000")).toBe(22400000);
  });

  it("mantiene decimales con formato local", () => {
    expect(parseCurrencyLikeValue("1.500.000,50")).toBe(1500000.5);
  });

  it("soporta notación científica", () => {
    expect(parseCurrencyLikeValue("2.24E7")).toBe(22400000);
  });
});

