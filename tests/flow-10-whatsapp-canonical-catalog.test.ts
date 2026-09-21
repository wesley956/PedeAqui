import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  loadCatalogCandidates: vi.fn(),
  loadProductDetails: vi.fn(),
  findCompositionProfiles: vi.fn(),
  loadCompositionProfile: vi.fn(),
  addItem: vi.fn(),
}));

vi.mock("@/server/conversations/whatsapp-order-catalog", () => ({
  loadWhatsAppCatalogCandidates: mocks.loadCatalogCandidates,
  loadWhatsAppProductDetails: mocks.loadProductDetails,
  findWhatsAppCompositionProfiles: mocks.findCompositionProfiles,
  loadWhatsAppCompositionProfile: mocks.loadCompositionProfile,
}));

vi.mock("@/server/cart/cart-service", () => ({
  CartService: { addItem: mocks.addItem },
}));

import { WhatsAppOrderService } from "@/server/conversations/whatsapp-order-service";

const organizationId = "72000000-0000-4000-8000-000000000001";
const storeId = "72000000-0000-4000-8000-000000000002";
const productId = "72000000-0000-4000-8000-000000000010";
const groupId = "72000000-0000-4000-8000-000000000020";
const firstModifierId = "72000000-0000-4000-8000-000000000030";
const secondModifierId = "72000000-0000-4000-8000-000000000031";

const baseInput = {
  organizationId,
  storeId,
  storeSlug: "flow10-technical-store",
  storeName: "FLOW-10 Technical Store",
  contactName: null,
  contactPhone: "5500000000000",
  step: "order_items" as const,
};

function canonicalCandidate() {
  return {
    id: productId,
    name: "Produto Canônico Técnico",
    description: null,
    price_cents: 2500,
    promotional_price_cents: null,
  };
}

function canonicalDetails(withModifiers: boolean) {
  return {
    id: productId,
    name: "Produto Canônico Técnico",
    description: null,
    imageUrl: null,
    regularPriceCents: 2500,
    effectivePriceCents: 2500,
    promotionLabel: null,
    preparationTimeMinutes: 10,
    availability: "available",
    sellable: true,
    operational: { scheduleOpen: true, acceptingOrders: true, canOrder: true, label: "open" },
    modifierGroups: withModifiers ? [{
      id: groupId,
      name: "Opção canônica",
      description: null,
      required: true,
      minSelection: 1,
      maxSelection: 1,
      selectionMode: "distinct_choices",
      distributionTotal: null,
      modifiers: [
        { id: firstModifierId, name: "Primeira opção técnica", priceCents: 0 },
        { id: secondModifierId, name: "Segunda opção técnica", priceCents: 300 },
      ],
    }] : [],
    gas: null,
    projection: { businessType: "restaurant", catalogLabel: "cardápio", itemLabel: "item", optionLabel: "adicional" },
  };
}

describe("FLOW-10 B03/B04 canonical WhatsApp catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCompositionProfiles.mockResolvedValue([]);
    mocks.loadCompositionProfile.mockResolvedValue(null);
    mocks.addItem.mockResolvedValue({ token: "flow10-technical-cart" });
  });

  it("B03 resolves and adds only the tenant-scoped canonical catalog product", async () => {
    mocks.loadCatalogCandidates.mockResolvedValue([canonicalCandidate()]);
    mocks.loadProductDetails.mockResolvedValue(canonicalDetails(false));

    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      text: "2 produto canonico tecnico",
      context: { channel: "whatsapp_order", version: 1 },
    });

    expect(mocks.loadCatalogCandidates).toHaveBeenCalledWith({
      organizationId,
      storeId,
      storeSlug: "flow10-technical-store",
      query: "produto canonico tecnico",
    });
    expect(mocks.loadProductDetails).toHaveBeenCalledWith({
      organizationId,
      storeId,
      storeSlug: "flow10-technical-store",
      productId,
    });
    expect(mocks.addItem).toHaveBeenCalledWith({
      storeSlug: "flow10-technical-store",
      productId,
      quantity: 2,
      note: "Pedido iniciado pelo WhatsApp",
      modifierIds: [],
      modifierSelections: [],
      gasSaleMode: null,
    }, null);
    expect(result.body).toContain("2x Produto Canônico Técnico");
    expect(result.nextStep).toBe("order_name");
  });

  it("B04 prompts from canonical options and submits the selected canonical modifier id", async () => {
    mocks.loadCatalogCandidates.mockResolvedValue([canonicalCandidate()]);
    mocks.loadProductDetails.mockResolvedValue(canonicalDetails(true));

    const prompt = await WhatsAppOrderService.handle({
      ...baseInput,
      text: "1 produto canonico tecnico",
      context: { channel: "whatsapp_order", version: 1 },
    });

    expect(prompt.body).toContain("1 — Primeira opção técnica");
    expect(prompt.body).toContain("2 — Segunda opção técnica (+R$\u00a03,00)");
    expect(prompt.context?.pendingModifiers).toMatchObject({
      productId,
      currentGroupId: groupId,
      quantity: 1,
    });
    expect(mocks.addItem).not.toHaveBeenCalled();

    const completed = await WhatsAppOrderService.handle({
      ...baseInput,
      text: "2",
      context: prompt.context,
    });

    expect(mocks.loadProductDetails).toHaveBeenLastCalledWith({
      organizationId,
      storeId,
      storeSlug: "flow10-technical-store",
      productId,
    });
    expect(mocks.addItem).toHaveBeenCalledWith({
      storeSlug: "flow10-technical-store",
      productId,
      quantity: 1,
      note: "Opções escolhidas pelo WhatsApp",
      modifierIds: [],
      modifierSelections: [{ modifierId: secondModifierId, quantity: 1 }],
      gasSaleMode: null,
    }, null);
    expect(completed.body).toContain("1x Produto Canônico Técnico");
  });

  it("B04 rejects an option absent from the canonical group without mutating the cart", async () => {
    mocks.loadProductDetails.mockResolvedValue(canonicalDetails(true));

    const pendingContext = {
      channel: "whatsapp_order" as const,
      version: 1 as const,
      pendingModifiers: {
        productId,
        name: "Produto Canônico Técnico",
        quantity: 1,
        currentGroupId: groupId,
        completedGroupIds: [],
        selections: [],
      },
    };

    const result = await WhatsAppOrderService.handle({
      ...baseInput,
      text: "opção inventada",
      context: pendingContext,
    });

    expect(result.body).toContain("Não consegui identificar");
    expect(result.context).toEqual(pendingContext);
    expect(mocks.addItem).not.toHaveBeenCalled();
  });
});
