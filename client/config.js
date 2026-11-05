// Feature flags & monetization hooks. Everything is OFF until Jake provides accounts.
export const CONFIG = {
  version: '2026-11-05',
  siteUrl: 'https://prismku.com',
  launchDay: '2026-10-31',
  ads: { enabled: false, provider: null, slotId: null },       // e.g. { enabled: true, provider: 'adsense', client: 'ca-pub-…', slotId: '…' }
  tips: { enabled: false, url: null, label: 'Support Prismku' }, // e.g. Ko-fi / Buy Me a Coffee / Stripe payment link
  pro: { enabled: false, checkoutUrl: null },                  // cosmetic Pro themes (concept, stubbed)
};
