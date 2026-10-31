import { describe, expect, it } from "vitest";
import { validateBuyerInterpretation, type BuyerInterpretation } from "../packages/agent/src/semantics/business-facts";
import { buyerFacts } from "../packages/agent/src/policy/guards";
import type { Source } from "../lib/order-rescue/models";

const fact = (state: "YES" | "NO" | "CONDITIONAL" | "UNKNOWN" | "CONFLICTING", source_ref: string | null, quote: string | null) => ({ state, citations: source_ref && quote ? [{ source_ref, quote }] : [] });
const buyer: Source = { source_ref: "BUYER-1", phase: "T0", source_type: "BUYER_MESSAGE", actor: "buyer", occurred_at: "2026-10-31T09:00:00+07:00", content: { text: "I still want the parcel, but tomorrow nobody can receive it." } };
const courier: Source = { source_ref: "COURIER-1", phase: "T0", source_type: "COURIER_NOTE", actor: "courier", occurred_at: "2026-10-31T09:00:00+07:00", content: { text: "Buyer refused the parcel." } };

describe("buyer semantic facts preserve provenance without keyword classification", () => {
  it("accepts model-interpreted states only when tied to an exact direct-buyer quote", () => {
    const sources = [buyer];
    const quote = "I still want the parcel";
    const proposed: BuyerInterpretation = {
      intent: fact("YES", buyer.source_ref, quote),
      availability: fact("CONDITIONAL", buyer.source_ref, quote),
      cod_readiness: fact("UNKNOWN", null, null),
      address_change: fact("NO", buyer.source_ref, quote),
      after_deadline: fact("UNKNOWN", null, null),
    };
    expect(validateBuyerInterpretation(proposed, sources)).toEqual(proposed);
  });

  it("preserves a contradiction expressed in two exact quotes from one buyer message", () => {
    const source: Source = { ...buyer, source_ref: "BUYER-CONFLICT", content: { text: "I still want the parcel. I do not want it anymore." } };
    const proposed: BuyerInterpretation = {
      intent: { state: "CONFLICTING", citations: [{ source_ref: source.source_ref, quote: "I still want the parcel" }, { source_ref: source.source_ref, quote: "I do not want it anymore" }] },
      availability: fact("UNKNOWN", null, null), cod_readiness: fact("UNKNOWN", null, null),
      address_change: fact("UNKNOWN", null, null), after_deadline: fact("UNKNOWN", null, null),
    };
    expect(validateBuyerInterpretation(proposed, [source])).toEqual(proposed);
  });

  it("rejects courier notes as proof of buyer intent", () => {
    const proposed: BuyerInterpretation = {
      intent: fact("YES", courier.source_ref, String((courier.content as any).text)),
      availability: fact("UNKNOWN", null, null), cod_readiness: fact("UNKNOWN", null, null),
      address_change: fact("UNKNOWN", null, null), after_deadline: fact("UNKNOWN", null, null),
    };
    expect(() => validateBuyerInterpretation(proposed, [courier])).toThrow("invalid_semantic_provenance");
  });

  it("rejects paraphrases presented as source quotations", () => {
    const proposed: BuyerInterpretation = {
      intent: fact("YES", buyer.source_ref, "I want to receive it tomorrow"),
      availability: fact("UNKNOWN", null, null), cod_readiness: fact("UNKNOWN", null, null),
      address_change: fact("UNKNOWN", null, null), after_deadline: fact("UNKNOWN", null, null),
    };
    expect(() => validateBuyerInterpretation(proposed, [buyer])).toThrow("invalid_semantic_provenance");
  });

  it("passes negation and conditional replies through from semantic assessment without keyword rules", () => {
    const source: Source = { ...buyer, source_ref: "BUYER-REPLY", source_type: "BUYER_REPLY", content: { text: "I do not want the parcel. If my sister gets home, she can receive it." } };
    const proposed: BuyerInterpretation = {
      intent: fact("NO", source.source_ref, "I do not want the parcel"),
      availability: fact("CONDITIONAL", source.source_ref, "If my sister gets home, she can receive it"),
      cod_readiness: fact("UNKNOWN", null, null), address_change: fact("UNKNOWN", null, null), after_deadline: fact("UNKNOWN", null, null),
    };
    const interpreted = validateBuyerInterpretation(proposed, [source]);
    expect(buyerFacts({ semantic_facts: interpreted } as any)).toEqual(proposed);
  });
});
