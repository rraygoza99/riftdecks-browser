// Legend-name normalisation applied once when decks load.
//
// Checked variants (Oct 2026 data):
//   - "Master Yi, Wuju Bladesman" (OGS-019) and "Master Yi, Wuju Master"
//     (UNL-191) are two different legend cards -> kept separate.
//   - "Viktor, Herald of the Arcane" (OGN-308) is the Viktor legend.
//     "Viktor, Innovator" (OGN-117) is Viktor's *champion unit*, which one
//     malformed decklist put in the legend slot -> normalised to the legend.
export const LEGEND_ALIASES = {
  'Viktor, Innovator': 'Viktor, Herald of the Arcane',
}

export function normalizeLegendName(name) {
  if (!name) return name
  return LEGEND_ALIASES[name] ?? name
}

// Returns a new deck object only when the legend name actually changes, so
// identity (and favourites keyed by deckUrl) is untouched.
export function normalizeDeckLegend(deck) {
  const name = normalizeLegendName(deck.legendName)
  return name === deck.legendName ? deck : { ...deck, legendName: name, legendAliasOf: deck.legendName }
}
