// Original written guides for RiftDecks Browser.
//
// Each guide is plain data so the content is easy to edit, review, and expand.
// Body is an array of typed blocks rendered by GuideArticle:
//   { type: 'p',  text }                      → paragraph
//   { type: 'h2', text }                      → section heading
//   { type: 'ul', items: [] }                 → bullet list
//   { type: 'ol', items: [] }                 → numbered list
//   { type: 'quote', text }                   → callout / note
//
// These are starter articles written for this project. Review and expand them
// with your own play experience — authentic, first-hand writing is exactly what
// makes the site valuable to readers.

export const GUIDES = [
  {
    slug: 'how-we-track-the-riftbound-meta',
    title: 'How RiftDecks Browser Tracks the Riftbound Meta',
    description:
      'A plain-language explanation of where our tournament data comes from, how it is cleaned, and what each number on the site actually measures.',
    date: '2026-07-07',
    updated: '2026-07-07',
    readingMinutes: 5,
    body: [
      {
        type: 'p',
        text:
          'RiftDecks Browser exists to answer one question quickly: what is actually winning Riftbound tournaments right now? To do that honestly, it helps to understand exactly what we measure and — just as importantly — what we do not. This guide walks through our whole pipeline so you can judge the numbers for yourself.',
      },
      { type: 'h2', text: 'Where the data comes from' },
      {
        type: 'p',
        text:
          'Every deck you see is drawn from publicly posted competitive tournament results. We collect the finishing placement, the legend played, the tournament name and date, and the approximate market price of the cards in the list. We refresh this data every day and prune tournaments older than about six weeks, so the meta you are looking at reflects the current format rather than results from a long-gone patch.',
      },
      {
        type: 'quote',
        text:
          'A deck appearing here means it was registered at a tracked event — not that it won a specific match. Placement is our proxy for success, and like every proxy it has limits.',
      },
      { type: 'h2', text: 'What "1st-place rate" really means' },
      {
        type: 'p',
        text:
          'The Meta dashboard reports each legend\'s 1st-place rate: the share of that legend\'s tracked decks that finished first at their event. This is a placement statistic, not a head-to-head win rate. We have no visibility into individual game results, so we cannot tell you that Legend A beats Legend B 60% of the time. What we can tell you is how often a legend converts an appearance into a tournament victory.',
      },
      {
        type: 'p',
        text:
          'Because a single small tournament can produce a first-place finish from a tiny sample, we only rank a legend by 1st-place rate once it has at least ten tracked decks. That threshold filters out the noise of a lucky one-off result and keeps the leaderboard meaningful.',
      },
      { type: 'h2', text: 'Popularity versus performance' },
      {
        type: 'p',
        text:
          'It is tempting to treat the most popular legend as the best legend, but the two measure different things. Popularity tells you what the field expects you to bring — useful for planning your matchups and your sideboard. Performance (placement and 1st-place rate) tells you what is actually converting. A healthy read of the meta uses both together: a legend that is both popular and high-converting is a genuine pillar of the format, while a legend that is rare but high-converting may be an underexplored edge.',
      },
      { type: 'h2', text: 'How the card analysis is built' },
      {
        type: 'p',
        text:
          'For each legend, we sample its strongest recent lists — specifically top-8 finishers — and aggregate the cards they run. For every card we compute two numbers: its inclusion rate (the share of sampled decks that run it) and its average copy count (how many copies those decks typically play). A card with a high inclusion rate is effectively a staple for that legend; a card that shows up in only a minority of lists is where pilots are expressing their own preferences.',
      },
      {
        type: 'p',
        text:
          'We deliberately restrict the card analysis to top-8 decks because incomplete or casual lists add noise. We also drop any deck whose total card value is under a dollar, since those are almost always placeholder or unfinished entries rather than real tournament decks.',
      },
      { type: 'h2', text: 'Reading the numbers responsibly' },
      {
        type: 'ul',
        items: [
          'Small samples move fast. Early in a format, a handful of events can swing a legend\'s rate dramatically. Give the data a week or two to stabilise before drawing firm conclusions.',
          'Placement rewards consistency. Decks that reliably reach the top tables will look strong here even if they lack an explosive ceiling — which is often exactly what you want in a tournament.',
          'Prices are estimates. The market moves, and reprints or spikes can change a deck\'s cost overnight. Treat price trends as directional, not exact.',
        ],
      },
      {
        type: 'p',
        text:
          'Used this way, the site is less a scoreboard and more a lens: a fast way to see the shape of the format so you can make your own informed decisions about what to build and play.',
      },
    ],
  },
  {
    slug: 'reading-tournament-results',
    title: 'How to Read Tournament Results and Spot the Best Decks',
    description:
      'Placement, sample size, and consistency all shape what a results page is really telling you. Here is a practical framework for reading them well.',
    date: '2026-07-07',
    updated: '2026-07-07',
    readingMinutes: 6,
    body: [
      {
        type: 'p',
        text:
          'A list of tournament results looks objective, but two people can read the same standings and reach opposite conclusions. The difference is usually in how they weigh sample size, event strength, and consistency. This guide lays out a simple framework you can apply to any Riftbound results page — including the ones on this site.',
      },
      { type: 'h2', text: 'Start with the size of the event' },
      {
        type: 'p',
        text:
          'A first-place finish at a 12-player local is not the same signal as a first-place finish at a 200-player open, even though both read as "1st." Larger events pit a deck against more pilots, more preparation, and more variance to survive. When you scan results, weight finishes by the strength and size of the field. A deck that keeps reaching the top tables at big events is telling you something far more reliable than a deck with one lucky trophy at a small one.',
      },
      { type: 'h2', text: 'Prefer repetition over peaks' },
      {
        type: 'p',
        text:
          'The single most useful habit in reading a meta is to look for decks that show up again and again in the upper standings, rather than the one deck that spiked a single event. Consistency across multiple tournaments and multiple pilots is the clearest evidence that a strategy is genuinely strong, not just well-positioned for one weekend or piloted by one exceptional player.',
      },
      {
        type: 'quote',
        text:
          'One trophy is a data point. Ten top-8s across different events and different players is a trend. Build toward trends.',
      },
      { type: 'h2', text: 'Separate the deck from the pilot' },
      {
        type: 'p',
        text:
          'Great players drag mediocre decks to good finishes. When the same person wins repeatedly with a fringe strategy, the result may say more about them than about the deck. Look for archetypes that succeed in many different hands. That breadth of success is what makes a deck a safe, repeatable choice for you rather than a trap that only works for its inventor.',
      },
      { type: 'h2', text: 'Use popularity as a map, not a verdict' },
      {
        type: 'p',
        text:
          'The most-played legend defines the field you have to beat. Even if you never intend to play it, you should know its game plan cold, because you will face it repeatedly. Popularity data is therefore most valuable as a planning tool: it tells you which matchups to practice, which cards to respect, and where your sideboard slots should point.',
      },
      { type: 'h2', text: 'A quick checklist' },
      {
        type: 'ol',
        items: [
          'How big and how strong was the event? Weight finishes accordingly.',
          'Does this deck appear repeatedly, or is it a one-off spike?',
          'Has it succeeded in multiple pilots\' hands, or just one?',
          'Is it popular, performing, or both — and what does that imply for your matchups?',
          'What is the cost, and does the payoff justify it for your goals?',
        ],
      },
      {
        type: 'p',
        text:
          'Run any results page through those five questions and you will consistently extract more signal than someone who simply reads the top line. The decks worth your time are the ones that keep showing up, in many hands, at events that matter.',
      },
    ],
  },
  {
    slug: 'understanding-deck-prices',
    title: 'Understanding Deck Prices in Riftbound',
    description:
      'Why competitive deck prices move, how to read the price trend on the Meta dashboard, and how to build competitively without overspending.',
    date: '2026-07-07',
    updated: '2026-07-07',
    readingMinutes: 5,
    body: [
      {
        type: 'p',
        text:
          'Cost is part of every deck decision, and Riftbound is no exception. RiftDecks Browser attaches an estimated market price to each tracked list and charts the average price of competitive decks over time. This guide explains what drives those numbers and how to use them to build smart.',
      },
      { type: 'h2', text: 'Why competitive prices rise and fall' },
      {
        type: 'p',
        text:
          'The price of a top deck is really the price of demand. When an archetype starts winning, more players want its key cards, and prices climb — often before the next print run can catch up. When the meta shifts away from a strategy, or when a card is reprinted, demand cools and prices soften. The average-price trend on the Meta dashboard is essentially a picture of where that demand is concentrated across the whole format.',
      },
      {
        type: 'quote',
        text:
          'A rising average deck price usually means the format is consolidating around a few expensive staples. A falling one often means the field has diversified or fresh product has eased supply.',
      },
      { type: 'h2', text: 'Chase cards versus staples' },
      {
        type: 'p',
        text:
          'Most of a deck\'s cost tends to live in a small number of high-impact cards. Some of these are true staples that appear across many decks and hold their value; others are chase cards tied to a single hot archetype, whose price can collapse the moment the meta moves on. Before you invest, it is worth asking which category a pricey card falls into. Staples are safer long-term purchases; chase cards are a bet on the current meta persisting.',
      },
      { type: 'h2', text: 'Building competitively on a budget' },
      {
        type: 'ul',
        items: [
          'Prioritise flexible staples that appear across several legends — they hold value and keep your options open as the meta shifts.',
          'Use the card analysis inclusion rates to separate must-run cards from optional tech, so you spend first on what a deck truly needs.',
          'Watch the price trend before buying into a spiking archetype; buying at the peak of hype is how budgets get wrecked.',
          'Consider a slightly-off-meta legend with a high 1st-place rate but lower popularity — these can offer strong results at a lower entry cost.',
        ],
      },
      { type: 'h2', text: 'Prices are directional, not exact' },
      {
        type: 'p',
        text:
          'Finally, treat every price here as an estimate. Card markets are volatile, regional, and constantly moving, and no single snapshot captures that perfectly. The value of our price data is in the trend and the relative comparison — which decks cost more than others, and which way the format is drifting — rather than in any exact dollar figure. Used that way, it is a genuinely useful input into deciding what to build next.',
      },
    ],
  },
]

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) || null
}
