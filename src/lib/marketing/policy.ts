const PROFIT =
  /guaranteed|100x|\bmoon\b|get rich|can(?:not|'t) lose|price will|will pump|sure profit|financial freedom|don't miss (?:the )?gains/i;
const ENDORSE = /endorsed by|official partner|in partnership with|backed by the (?:team|foundation|company)/i;
const URGENCY = /last chance|only \d+ (?:spots|wallets)|selling out|buy before it's too late|limited spots/i;
const BUY_PUSH = /buy now|ape in|invest now|don't miss the launch|get in early|presale is live/i;

export function complianceWarnings(text: string, kind: string) {
  const warnings: string[] = [];
  if (PROFIT.test(text)) warnings.push("This draft predicts profit or price movement. Remove it before publishing.");
  if (ENDORSE.test(text))
    warnings.push("This draft implies an endorsement or partnership. Keep it only if that relationship is independently verified.");
  if (URGENCY.test(text)) warnings.push("This draft uses urgency or scarcity that the research did not verify.");
  if (kind === "telegram_ad") {
    if ([...text].length > 160) warnings.push(`Telegram sponsored messages allow 160 characters. This draft is ${[...text].length}.`);
    warnings.push(
      "Official Telegram Ads restrict financial promotions. A meme-token investment ad is likely ineligible. This is a local check, not a submission to Telegram.",
    );
    if (BUY_PUSH.test(text))
      warnings.push(
        "This reads as a solicitation to buy. Do not rewrite it to disguise a financial promotion. Use a factual community message or skip paid placement.",
      );
  }
  if (kind !== "telegram_ad" && BUY_PUSH.test(text)) {
    warnings.push("Buying language should stay factual. Do not add pressure or unverified trading claims.");
  }
  return warnings;
}

export function telegramAdEligible(text: string, destination: string | null) {
  const warnings = complianceWarnings(text, "telegram_ad");
  const destinationOk = Boolean(destination && /^https:\/\/t\.me\/[A-Za-z0-9_]+\/?$/.test(destination));
  if (!destination) warnings.push("A Telegram destination is required and is not confirmed.");
  else if (!destinationOk)
    warnings.push(
      "Destination should be a public https://t.me/<name> link. Bots and private invites need a separate check against current Telegram Ads rules.",
    );
  warnings.push("Ads are reviewed by Telegram. This app does not submit them.");
  return {
    characters: [...text].length,
    limit: 160,
    withinLimit: [...text].length <= 160,
    destinationOk,
    eligible: false,
    eligibilityNote: "Not marked eligible. Crypto token promotions are often prohibited, and this app will not claim otherwise.",
    warnings,
  };
}
