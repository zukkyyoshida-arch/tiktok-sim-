/**
 * 戦略MG（製造業）意思決定カードデッキ定義
 */

export const CARD_TYPES = {
  PURCHASE: "purchase",       // 仕入 (ツ)
  PRODUCE: "produce",         // 製造 (コ・サ)
  SALE_DIRECT: "sale_direct", // 直接販売 (キ)
  SALE_AUCTION: "sale_auction", // 入札販売 (ネ)
  BUY_MACHINE: "buy_machine", // 機械購入 (ケ)
  HIRE: "hire",               // 雇用 (シ)
  LOAN: "loan",               // 借入 (オ)
  RD: "rd",                   // 研究開発 (チ)
  AD: "ad",                   // 広告 (セ)
  RISK_FIRE: "risk_fire",     // 災害：火災
  RISK_MISS: "risk_miss",     // 災害：製造ミス
  RISK_THEFT: "risk_theft",   // 災害：盗難
};

// 意思決定カードのマスターデータ
export const CARD_DECK_TEMPLATE = [
  // 仕入カード (ツ)
  { id: "p1", title: "材料仕入 (ツ)", type: CARD_TYPES.PURCHASE, description: "市場から材料を購入できます。機械の受入能力・人員数に応じた数を仕入れられます。", color: "#05ffa1", icon: "📦" },
  { id: "p2", title: "材料仕入 (ツ)", type: CARD_TYPES.PURCHASE, description: "市場から材料を購入できます。機械の受入能力・人員数に応じた数を仕入れられます。", color: "#05ffa1", icon: "📦" },
  { id: "p3", title: "材料仕入 (ツ)", type: CARD_TYPES.PURCHASE, description: "市場から材料を購入できます。機械の受入能力・人員数に応じた数を仕入れられます。", color: "#05ffa1", icon: "📦" },
  { id: "p4", title: "材料仕入 (ツ)", type: CARD_TYPES.PURCHASE, description: "市場から材料を購入できます。機械の受入能力・人員数に応じた数を仕入れられます。", color: "#05ffa1", icon: "📦" },

  // 製造カード (コ・サ)
  { id: "m1", title: "材料投入 ＆ 完成加工 (コ・サ)", type: CARD_TYPES.PRODUCE, description: "手持ちの材料を仕掛品へ投入（コ）、または仕掛品を完成品（サ）へ加工できます。", color: "#9b51e0", icon: "⚙️" },
  { id: "m2", title: "材料投入 ＆ 完成加工 (コ・サ)", type: CARD_TYPES.PRODUCE, description: "手持ちの材料を仕掛品へ投入（コ）、または仕掛品を完成品（サ）へ加工できます。", color: "#9b51e0", icon: "⚙️" },
  { id: "m3", title: "材料投入 ＆ 完成加工 (コ・サ)", type: CARD_TYPES.PRODUCE, description: "手持ちの材料を仕掛品へ投入（コ）、または仕掛品を完成品（サ）へ加工できます。", color: "#9b51e0", icon: "⚙️" },
  { id: "m4", title: "材料投入 ＆ 完成加工 (コ・サ)", type: CARD_TYPES.PRODUCE, description: "手持ちの材料を仕掛品へ投入（コ）、または仕掛品を完成品（サ）へ加工できます。", color: "#9b51e0", icon: "⚙️" },

  // 直接販売カード (キ)
  { id: "sd1", title: "直接即時販売 (キ)", type: CARD_TYPES.SALE_DIRECT, description: "競りを行わず、市場へ直接製品を販売できます。安定した価格で現金化するチャンス！", color: "#ff007f", icon: "💰" },
  { id: "sd2", title: "直接即時販売 (キ)", type: CARD_TYPES.SALE_DIRECT, description: "競りを行わず、市場へ直接製品を販売できます。安定した価格で現金化するチャンス！", color: "#ff007f", icon: "💰" },

  // 競合入札カード (ネ)
  { id: "sa1", title: "競合入札オークション (ネ)", type: CARD_TYPES.SALE_AUCTION, description: "4社による製品販売の入札バトル！最高入札額を提示した企業が落札します。研究開発や広告が鍵。", color: "#ff007f", icon: "⚔️" },
  { id: "sa2", title: "競合入札オークション (ネ)", type: CARD_TYPES.SALE_AUCTION, description: "4社による製品販売の入札バトル！最高入札額を提示した企業が落札します。研究開発や広告が鍵。", color: "#ff007f", icon: "⚔️" },
  { id: "sa3", title: "競合入札オークション (ネ)", type: CARD_TYPES.SALE_AUCTION, description: "4社による製品販売の入札バトル！最高入札額を提示した企業が落札します。研究開発や広告が鍵。", color: "#ff007f", icon: "⚔️" },

  // 機械購入 (ケ)
  { id: "bm1", title: "機械工具購入 (ケ)", type: CARD_TYPES.BUY_MACHINE, description: "工場の生産能力を高めるため、大型機械（¥80万）、小型機械（¥40万）、またはアタッチメント（¥10万）を購入できます。", color: "#9b51e0", icon: "🏗️" },
  { id: "bm2", title: "機械工具購入 (ケ)", type: CARD_TYPES.BUY_MACHINE, description: "工場の生産能力を高めるため、大型機械（¥80万）、小型機械（¥40万）、またはアタッチメント（¥10万）を購入できます。", color: "#9b51e0", icon: "🏗️" },

  // 雇用 (シ)
  { id: "h1", title: "社員雇用 (シ)", type: CARD_TYPES.HIRE, description: "生産力を維持・向上させるため、新しい社員を雇用できます（労務費発生）。", color: "#00f2fe", icon: "👤" },

  // 借入 (オ)
  { id: "l1", title: "長期借入金 (オ)", type: CARD_TYPES.LOAN, description: "金融機関から運転資金を融資（借入）できます。金利や借入枠に注意してください。", color: "#ffd000", icon: "🏦" },

  // 研究開発 (チ)
  { id: "rd1", title: "研究開発投資 (チ)", type: CARD_TYPES.RD, description: "研究開発費（¥20万）を投資して、経営技術チップを獲得します。入札や製品単価で有利になります。", color: "#00f2fe", icon: "🔬" },

  // 広告 (セ)
  { id: "ad1", title: "広告宣伝 (セ)", type: CARD_TYPES.AD, description: "広告宣伝費（¥10万）を支払い、集客力を高めます。オークションで大きな力を発揮します。", color: "#ff007f", icon: "📢" },

  // 事故災害カード (リスク)
  { id: "rf1", title: "火災発生 (災害損失)", type: CARD_TYPES.RISK_FIRE, description: "突発的な火災が発生！倉庫の材料在庫のうち【2個】が焼失し、特別損失に計上されます。", color: "#ff3838", icon: "🔥" },
  { id: "rm1", title: "製造不良 (製造ミス)", type: CARD_TYPES.RISK_MISS, description: "ラインでの重大な製造ミスが発生！仕掛品のうち【1個】がスクラップとなり、製造損失となります。", color: "#ff3838", icon: "💥" },
  { id: "rt1", title: "倉庫盗難 (盗難損失)", type: CARD_TYPES.RISK_THEFT, description: "倉庫で製品の盗難が発生！完成された製品のうち【1個】が紛失し、災害損失となります。", color: "#ff3838", icon: "🕵️" },
];

/**
 * デッキを生成してシャッフルする
 */
export function generateShuffledDeck() {
  const deck = [...CARD_DECK_TEMPLATE];
  
  // フィッシャー・イェーツのシャッフルアルゴリズム
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}
