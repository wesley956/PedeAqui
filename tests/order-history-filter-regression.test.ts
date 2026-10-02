import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderHistoryFilters, orderHistoryQuery } from "@/features/orders/order-history-filters";
function forms(period: "today" | "date", selectedDate = "2026-09-29") {
  const html = renderToStaticMarkup(createElement(OrderHistoryFilters, { search: "#42", period, selectedDate }));
  return { html, forms: [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(match => match[1]!) };
}
function successfulInputs(form: string) {
  return Object.fromEntries([...form.matchAll(/<input\b[^>]*>/g)].map(match => {
    const name = /name="([^"]*)"/.exec(match[0])?.[1] ?? "";
    const value = /value="([^"]*)"/.exec(match[0])?.[1] ?? "";
    return [name, value];
  }));
}
describe("daily history filter navigation [1192]", () => {
  it("search button and Enter carry the active period independently of a submitter", () => {
    const { forms: rendered } = forms("today");
    expect(successfulInputs(rendered[0]!)).toEqual({ period: "today", q: "#42" });
    expect(rendered[0]).not.toContain('type="date"');
    expect(rendered[0]).not.toContain('name="page"');
  });
  it("search keeps the specific date and cannot silently return to all history", () => {
    expect(successfulInputs(forms("date").forms[0]!)).toEqual({ period: "date", date: "2026-09-29", q: "#42" });
  });
  it("specific date submits period=date on Enter and retains the search", () => {
    const form = forms("today").forms[1]!;
    expect(successfulInputs(form)).toEqual({ period: "date", q: "#42", date: "2026-09-29" });
    expect(form).toMatch(/<input[^>]*type="date"[^>]*required/);
  });
  it("period links work independently of an invalid/incomplete date input", () => {
    const { html } = forms("date");
    expect(html).toContain('href="/pedidos/historico?q=%2342&amp;period=today"');
    expect(html).toContain('href="/pedidos/historico?q=%2342&amp;period=week"');
    expect(html).not.toContain('name="period" value="today"');
  });
  it("pagination/detail query keeps the date while switching presets removes it", () => {
    expect(orderHistoryQuery({ search: "#42", period: "date", date: "2026-09-29", page: 3 })).toEqual({ q: "#42", period: "date", date: "2026-09-29", page: "3" });
    expect(orderHistoryQuery({ search: "#42", period: "today", date: "2026-09-29" })).toEqual({ q: "#42", period: "today" });
    expect(orderHistoryQuery({ period: "all" })).toEqual({});
  });
});
