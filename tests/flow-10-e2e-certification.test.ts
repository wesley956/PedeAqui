import { describe, expect, it } from "vitest";

type Journey = "A" | "B" | "C" | "D" | "DEVICE";
type Severity = "P0" | "P1";
type Verdict = "NOT_PROVEN" | "PASS" | "FAIL";

type EvidenceKey =
  | "orderId"
  | "events"
  | "notificationJobId"
  | "maskedRecipient"
  | "providerStatus"
  | "publicTrackingStatus"
  | "artifact"
  | "verdict";

interface CertificationScenario {
  id: string;
  journey: Journey;
  severity: Severity;
  requirement: string;
  executionMode: "automated" | "controlled-e2e" | "browser-homologation" | "disposable-db";
  status: Verdict;
  evidenceRequired: EvidenceKey[];
  evidenceRefs: string[];
}

const fullEvidence: EvidenceKey[] = [
  "orderId",
  "events",
  "notificationJobId",
  "maskedRecipient",
  "providerStatus",
  "publicTrackingStatus",
  "artifact",
  "verdict",
];

const artifactEvidence: EvidenceKey[] = ["artifact", "verdict"];

const browserRunEvidence = [
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35499183077",
  "artifact:10601314868",
  "digest:sha256:893a114e7ff860e7b8efba59a2ae9fe21de744e6d69b18128c5f8aad5d14460c",
];

const isolatedChaosEvidence = [
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35552631268",
  "artifact:10618534610",
  "digest:sha256:ebdced1586524da6a8229d0f8bbca8ad0257a5be7e6072422b16721ad1d87e2f",
];

const closedStoreEvidence = [
  "issue:https://github.com/wesley956/PedeAqui/issues/1141#issuecomment-5748521010",
  "deployment:dpl_9aB1e1crfmDinM3RqenztVP5Lpnh",
];

const providerRetryEvidence = [
  "issue:https://github.com/wesley956/PedeAqui/issues/1141#issuecomment-5754620683",
  "pr:https://github.com/wesley956/PedeAqui/pull/1154",
  "commit:07abe35a3b79220f049f5962d4c5f9e03d557b25",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35553854093",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35553854095",
  "deployment:dpl_2RT1Uxh4zQb5ZR9ieajwhtztEViK",
];

const closedOrderSafetyEvidence = [
  "commit:fc3c285afb13b745a43dbbb99bf05a98dfc06b87",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35555635543",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35555635554",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35555635551",
  "artifact:10619264761",
  "digest:sha256:7a5eece550d366bc05a3c1eee96b76cd25c0006fa5f2259ad08e873893db908e",
];

const whatsappConfirmationEvidence = [
  "commit:6beeb35379484cf5c5682cb2791324c1af89dec3",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35571118936",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35571119106",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35571118933",
  "artifact:10626445285",
  "digest:sha256:ed8cb67e6733bdb1390121ebf62a85413499bf4ab04d27a0a7c0a4456f3e14df",
];

const whatsappSafeEntryEvidence = [
  "commit:5732b560c1b8fdd64cc6f33c8b26086320999181",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35572348505",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35572348490",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35572348512",
  "artifact:10626074737",
  "digest:sha256:8926666ca8c7feb61e6d53701ce70dc008fb36bd2361bdf9157883ff27626292",
];

const whatsappCanonicalCatalogEvidence = [
  "commit:a200fb6ca2a3509bc01ed440ffa817c65c0f5fdd",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35583718248",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35583718153",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35583717979",
  "artifact:10631926190",
  "digest:sha256:fafe5e0b92fb5fc457a1e2a6d1688d7a6a7be4e679f2d59516d5b2fc5b11a139",
];

const whatsappOfficialCheckoutEvidence = [
  "commit:bc1ce815556f955d886724278cd91c3078d09f72",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35584705532",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35584705474",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35584705495",
  "artifact:10631639289",
  "digest:sha256:f460953bbf490b63a43f9bebac03ca7dd5f645182bdb6adc32f8f4b8f3630cc7",
];

const whatsappResilienceBatchEvidence = [
  "commit:37cdb0bcaeabc4a1f70c2568d4d0241c55f05b37",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35608283133",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35608283135",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35608283164",
  "artifact:10642038099",
  "digest:sha256:8b8bfe7f932866a8ea8b77ac780048be14a03a6bd96e81c5165bc10efc96e50a",
];

const publicResilienceBatchEvidence = [
  "commit:ac2345a50d2a4819e7f682cfc8586488fbadc7c4",
  "ci:https://github.com/wesley956/PedeAqui/actions/runs/35632218975",
  "browser:https://github.com/wesley956/PedeAqui/actions/runs/35632218997",
  "workflow:https://github.com/wesley956/PedeAqui/actions/runs/35632219059",
  "artifact:10654861772",
  "digest:sha256:15b5a0793da4884ab7d06ff4efd68f5fac614ac9816b4d0ba4eb7d900b64c2e2",
];

const scenarios: CertificationScenario[] = [
  { id: "A01", journey: "A", severity: "P0", requirement: "Customer can open the public menu", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: publicResilienceBatchEvidence },
  { id: "A02", journey: "A", severity: "P0", requirement: "Cart accepts a simple item plus canonical modifier", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: publicResilienceBatchEvidence },
  { id: "A03", journey: "A", severity: "P0", requirement: "Checkout preserves identity, address and payment through confirmation", executionMode: "controlled-e2e", status: "NOT_PROVEN", evidenceRequired: fullEvidence, evidenceRefs: [] },
  { id: "A04", journey: "A", severity: "P0", requirement: "Checkout confirmation CTA remains reachable on supported mobile viewports", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "A05", journey: "A", severity: "P0", requirement: "Web checkout creates exactly one order", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: isolatedChaosEvidence },
  { id: "A06", journey: "A", severity: "P0", requirement: "order.created produces the specific notification job", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: isolatedChaosEvidence },
  { id: "A07", journey: "A", severity: "P0", requirement: "Customer notification reaches public stage recebido", executionMode: "controlled-e2e", status: "NOT_PROVEN", evidenceRequired: fullEvidence, evidenceRefs: [] },
  { id: "A08", journey: "A", severity: "P0", requirement: "Store confirmation converges to customer stage confirmado", executionMode: "controlled-e2e", status: "NOT_PROVEN", evidenceRequired: fullEvidence, evidenceRefs: [] },
  { id: "A09", journey: "A", severity: "P0", requirement: "Preparing/production update converges across notification and tracking", executionMode: "controlled-e2e", status: "NOT_PROVEN", evidenceRequired: fullEvidence, evidenceRefs: [] },
  { id: "A10", journey: "A", severity: "P0", requirement: "Delivery or pickup can reach completion with the same public projection", executionMode: "controlled-e2e", status: "NOT_PROVEN", evidenceRequired: fullEvidence, evidenceRefs: [] },
  { id: "A11", journey: "A", severity: "P0", requirement: "Onde esta meu pedido returns the last public notification stage", executionMode: "controlled-e2e", status: "NOT_PROVEN", evidenceRequired: fullEvidence, evidenceRefs: [] },

  { id: "B01", journey: "B", severity: "P0", requirement: "WhatsApp greeting starts a safe order conversation", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappSafeEntryEvidence },
  { id: "B02", journey: "B", severity: "P0", requirement: "Store operational status is checked before selling", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappSafeEntryEvidence },
  { id: "B03", journey: "B", severity: "P0", requirement: "WhatsApp uses canonical catalog data", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappCanonicalCatalogEvidence },
  { id: "B04", journey: "B", severity: "P0", requirement: "WhatsApp uses canonical modifiers and options", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappCanonicalCatalogEvidence },
  { id: "B05", journey: "B", severity: "P0", requirement: "WhatsApp cart and checkout use official services", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappOfficialCheckoutEvidence },
  { id: "B06", journey: "B", severity: "P0", requirement: "Payment and fulfillment are validated before final confirmation", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappOfficialCheckoutEvidence },
  { id: "B07", journey: "B", severity: "P0", requirement: "Order creation requires explicit SIM confirmation", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappConfirmationEvidence },
  { id: "B08", journey: "B", severity: "P0", requirement: "WhatsApp checkout creates exactly one order", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: whatsappConfirmationEvidence },
  { id: "B09", journey: "B", severity: "P0", requirement: "WhatsApp notifications and tracking share order identity and public projection", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: whatsappResilienceBatchEvidence },
  { id: "B10", journey: "B", severity: "P0", requirement: "Human handoff preserves conversation and checkout context", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappResilienceBatchEvidence },

  { id: "C01", journey: "C", severity: "P0", requirement: "Outside hours greeting reports closed store and next opening when available", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: closedStoreEvidence },
  { id: "C02", journey: "C", severity: "P0", requirement: "Quero pedir outside hours does not create an immediate order", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: closedOrderSafetyEvidence },
  { id: "C03", journey: "C", severity: "P0", requirement: "Tracking remains available for a legitimate order while store is closed", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: publicResilienceBatchEvidence },

  { id: "D01", journey: "D", severity: "P0", requirement: "Double click or double submit does not duplicate the order", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: isolatedChaosEvidence },
  { id: "D02", journey: "D", severity: "P0", requirement: "Two close WhatsApp messages do not duplicate order or state transition", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: closedOrderSafetyEvidence },
  { id: "D03", journey: "D", severity: "P0", requirement: "Provider retry does not duplicate customer notification", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: providerRetryEvidence },
  { id: "D04", journey: "D", severity: "P0", requirement: "Notification backlog above 25 jobs drains without loss or duplication", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: isolatedChaosEvidence },
  { id: "D05", journey: "D", severity: "P0", requirement: "Concurrent workers claim jobs safely and exactly once", executionMode: "disposable-db", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: isolatedChaosEvidence },
  { id: "D06", journey: "D", severity: "P0", requirement: "Checkout refresh preserves safe idempotent outcome", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: publicResilienceBatchEvidence },
  { id: "D07", journey: "D", severity: "P0", requirement: "Unstable internet does not create duplicate order or corrupt public state", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: publicResilienceBatchEvidence },
  { id: "D08", journey: "D", severity: "P0", requirement: "Unavailable Meta template outside session window has diagnosable safe failure", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: publicResilienceBatchEvidence },
  { id: "D09", journey: "D", severity: "P0", requirement: "Item paused during flow fails safely without stale sale", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappResilienceBatchEvidence },
  { id: "D10", journey: "D", severity: "P0", requirement: "Imperfect customer link can use a safe immutable order snapshot", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: fullEvidence, evidenceRefs: publicResilienceBatchEvidence },
  { id: "D11", journey: "D", severity: "P0", requirement: "Another phone or tenant cannot access the order", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappResilienceBatchEvidence },
  { id: "D12", journey: "D", severity: "P0", requirement: "Human handoff during WhatsApp checkout preserves safe resumable context", executionMode: "controlled-e2e", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: whatsappResilienceBatchEvidence },

  { id: "M320", journey: "DEVICE", severity: "P0", requirement: "Mobile viewport 320x568", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "M360", journey: "DEVICE", severity: "P0", requirement: "Mobile viewport 360x640", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "M390", journey: "DEVICE", severity: "P0", requirement: "Mobile viewport 390x844", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "M412", journey: "DEVICE", severity: "P0", requirement: "Mobile viewport 412x915", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "M430", journey: "DEVICE", severity: "P0", requirement: "Mobile viewport 430x932", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "MTAB", journey: "DEVICE", severity: "P0", requirement: "Tablet viewport", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "MDESK", journey: "DEVICE", severity: "P0", requirement: "Desktop viewport", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
  { id: "MKEY", journey: "DEVICE", severity: "P0", requirement: "Mobile checkout with virtual keyboard open", executionMode: "browser-homologation", status: "PASS", evidenceRequired: artifactEvidence, evidenceRefs: browserRunEvidence },
];

const requiredScenarioIds = [
  ...Array.from({ length: 11 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 3 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 12 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`),
  "M320", "M360", "M390", "M412", "M430", "MTAB", "MDESK", "MKEY",
];

const allowedVerdicts: Verdict[] = ["NOT_PROVEN", "PASS", "FAIL"];

function missingEvidenceKeys(scenario: CertificationScenario): EvidenceKey[] {
  return scenario.evidenceRequired.filter((key) => !fullEvidence.includes(key));
}

describe("FLOW-10 executable E2E certification matrix", () => {
  it("contains every mandatory scenario exactly once", () => {
    const ids = scenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...requiredScenarioIds].sort());
  });

  it("keeps every mandatory scenario classified as P0", () => {
    expect(scenarios.every((scenario) => scenario.severity === "P0")).toBe(true);
  });

  it("covers all mandatory journeys and device modes", () => {
    expect(new Set(scenarios.map((scenario) => scenario.journey))).toEqual(new Set(["A", "B", "C", "D", "DEVICE"]));
    expect(scenarios.filter((scenario) => scenario.journey === "DEVICE").map((scenario) => scenario.id)).toEqual([
      "M320", "M360", "M390", "M412", "M430", "MTAB", "MDESK", "MKEY",
    ]);
  });

  it("requires only canonical evidence fields", () => {
    for (const scenario of scenarios) {
      expect(scenario.evidenceRequired.length).toBeGreaterThan(0);
      expect(missingEvidenceKeys(scenario), `${scenario.id} contains unknown evidence keys`).toEqual([]);
      expect(scenario.evidenceRequired).toContain("verdict");
      expect(scenario.evidenceRequired).toContain("artifact");
    }
  });

  it("does not allow PASS without attached evidence references", () => {
    for (const scenario of scenarios) {
      expect(allowedVerdicts).toContain(scenario.status);
      if (scenario.status === "PASS") {
        expect(scenario.evidenceRefs.length, `${scenario.id} cannot be PASS without evidence`).toBeGreaterThan(0);
      }
    }
  });

  it("records only the evidence-backed PASS scenarios", () => {
    const evidenceBackedPasses = ["A01", "A02", "A04", "A05", "A06", "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09", "B10", "C01", "C02", "C03", "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "M320", "M360", "M390", "M412", "M430", "MTAB", "MDESK", "MKEY"];
    expect(scenarios.filter((scenario) => scenario.status === "PASS").map((scenario) => scenario.id)).toEqual(evidenceBackedPasses);
    expect(scenarios.filter((scenario) => scenario.status === "NOT_PROVEN")).toHaveLength(6);
    expect(scenarios.filter((scenario) => scenario.status === "FAIL")).toEqual([]);
  });
});
