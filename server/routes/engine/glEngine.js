// NOTE: Replace this stub with your real LLM call.
// This version uses heuristics and Supplier history as fallback.

export async function suggestGLAccounts(input) {
  const items = input.ItemDescription || [];
  const history = input.HistoricalGL || [];

  // 1) Use supplier history if dominant GL exists
  if (history.length > 0) {
    const top = history.sort((a, b) => b.count - a.count)[0];
    if (top.count >= Math.max(3, 0.7 * (history.reduce((x,y)=>x+y.count,0)))) {
      return [{
        account: top.account,
        label: "Historical dominant account",
        confidence: 0.85,
        rationale: "Based on >70% historical usage for this supplier"
      }];
    }
  }

  // 2) Simple keyword lexicon (Belgian chart)
  const desc = items.join(" ").toLowerCase();
  if (/software|license|saas/.test(desc)) {
    return [{
      account: "61xx",
      label: "Services – Software",
      confidence: 0.75,
      rationale: "Keyword match: software/service"
    }];
  }
  if (/transport|freight|shipping/.test(desc)) {
    return [{
      account: "61xx",
      label: "Services – Transport",
      confidence: 0.72,
      rationale: "Keyword match: transport"
    }];
  }
  if (/goods|materials|inventory/.test(desc)) {
    return [{
      account: "60xx",
      label: "Goods purchase",
      confidence: 0.70,
      rationale: "Keyword match: goods/materials"
    }];
  }

  // 3) No strong signal → return empty → rules.js will generate alert
  return [];
}