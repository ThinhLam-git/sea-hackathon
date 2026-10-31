import { z } from "zod";
import { sourceText, type Source } from "../../order-rescue/models";

export const BuyerSemanticState = z.enum(["YES", "NO", "CONDITIONAL", "UNKNOWN", "CONFLICTING"]);
const Citation = z.object({ source_ref: z.string().min(1), quote: z.string().trim().min(1).max(400) }).strict();
const BuyerFact = z.object({ state: BuyerSemanticState, citations: z.array(Citation).max(5) }).strict();
export const BuyerInterpretationSchema = z.object({
  intent: BuyerFact,
  availability: BuyerFact,
  cod_readiness: BuyerFact,
  address_change: BuyerFact,
  after_deadline: BuyerFact,
}).strict();
export type BuyerInterpretation = z.infer<typeof BuyerInterpretationSchema>;

/** Validate source ownership and exact quotation only; semantic meaning remains model-derived. */
export function validateBuyerInterpretation(proposal: unknown, sources: Source[]): BuyerInterpretation {
  const parsed = BuyerInterpretationSchema.safeParse(proposal);
  if (!parsed.success) throw new Error("invalid_semantic_provenance");
  const byRef = new Map(sources.map((source) => [source.source_ref, source]));
  for (const fact of Object.values(parsed.data)) {
    if (fact.state === "UNKNOWN" && fact.citations.length === 0) continue;
    if (fact.citations.length === 0) throw new Error("invalid_semantic_provenance");
    if (fact.state === "CONFLICTING" && new Set(fact.citations.map((citation) => citation.quote)).size < 2) {
      throw new Error("invalid_semantic_provenance");
    }
    for (const citation of fact.citations) {
      const source = byRef.get(citation.source_ref);
      if (!source || !["BUYER_MESSAGE", "BUYER_REPLY"].includes(source.source_type) || !sourceText(source).includes(citation.quote)) {
        throw new Error("invalid_semantic_provenance");
      }
    }
  }
  return parsed.data;
}
