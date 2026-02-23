export async function suggestGLAccounts(input) {
  const items = input.ItemDescription || [];
  const history = input.HistoricalGL || [];

  // 1) Supplier history dominance
  if (history.length > 0) {
    const total = history.reduce((s, r) => s + (r.count || 0), 0);
    const top = history.slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    if ((top?.count || 0) >= Math.max(3, 0.7 * total)) {
      return [{
        account: top.account,
        label: "Historical dominant account",
        confidence: 0.85,
        rationale: "Based on ≥70% historical usage for this supplier"
      }];
    }
  }

  // 2) Keyword lexicon
  const text = items.join(" ").toLowerCase();
  if (/software|license|saas/.test(text)) {
    return [{ account: "61xx", label: "Services – Software", confidence: 0.75, rationale: "Keyword: software" }];
  }
  if (/transport|freight|shipping/.test(text)) {
    return [{ account: "61xx", label: "Services – Transport", confidence: 0.72, rationale: "Keyword: transport" }];
  }
  if (/goods|materials|inventory/.test(text)) {
    return [{ account: "60xx", label: "Goods purchase", confidence: 0.70, rationale: "Keyword: goods/materials" }];
  }
  return [];
}
