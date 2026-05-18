/**
 * 戦略MG（製造業）カード定義（意思決定カード ✕ リスクカード）
 */

export const CARD_CATEGORIES = {
  DECISION: "decision", // 意思決定カード（引いたプレイヤーが自由に行動を選択可能）
  RISK: "risk"          // リスクカード（強制的な災害やイベントがランダムに発生）
};

export const CARD_TYPES = {
  PURCHASE: "purchase",
  PRODUCE: "produce",
  SALE_DIRECT: "sale_direct",
  SALE_AUCTION: "sale_auction",
  BUY_MACHINE: "buy_machine",
  HIRE: "hire",
  LOAN: "loan",
  RD: "rd",
  AD: "ad",
  RISK_FIRE: "risk_fire",
  RISK_MISS: "risk_miss",
  RISK_THEFT: "risk_theft",
  RISK_TAX: "risk_tax",
  RISK_REPAIR: "risk_repair"
};


// リスクイベントの種類
export const RISK_EVENTS = [
  { 
    id: "risk_fire", 
    title: "🔥 突発的火災 (材料消失)", 
    description: "倉庫で火災が発生しました！材料在庫から 2個 が焼失し、特別損失に計上されます。",
    actionType: "risk_fire"
  },
  { 
    id: "risk_miss", 
    title: "💥 工場製造不良 (仕掛品スクラップ)", 
    description: "生産機械のトラブルにより、現在仕掛中の製品から 1個 がスクラップになりました。",
    actionType: "risk_miss"
  },
  { 
    id: "risk_theft", 
    title: "🕵️ 製品盗難被害 (製品紛失)", 
    description: "倉庫の警備の隙を突かれ、完成した製品から 1個 が盗難に遭いました！",
    actionType: "risk_theft"
  },
  { 
    id: "risk_tax", 
    title: "💸 税務監査 (経費出金)", 
    description: "税務監査が入り、会計処理の修正のため雑損失として ¥10万 の出金（ソ）が発生します。",
    actionType: "risk_tax"
  },
  {
    id: "risk_machine_break",
    title: "🛠️ 機械故障 (修理費用)",
    description: "所有している機械の1台に不具合が発生し、緊急修理費として ¥10万（ス）の出金が発生します。",
    actionType: "risk_repair"
  }
];

// 山札（デック）のマスターテンプレート
// 意思決定カードが多く、時折リスクカードが混じる比率
export const CARD_DECK_TEMPLATE = [
  // 意思決定カード (Decision): 自由に次の行動を選択できる
  { id: "d1", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d2", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d3", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d4", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d5", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d6", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d7", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d8", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d9", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d10", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d11", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },
  { id: "d12", title: "経営意思決定カード (Decision)", category: CARD_CATEGORIES.DECISION, description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。", color: "#00f2fe", icon: "🧠" },

  // リスクカード (Risk): 引いた瞬間に何かが起きる！
  { id: "r1", title: "⚠️ リスク・偶発イベント (Risk)", category: CARD_CATEGORIES.RISK, description: "突発的な市場変動やアクシデントが発生！めくった瞬間にランダムなイベントが確定し、強制適用されます。", color: "#ff3838", icon: "🎲" },
  { id: "r2", title: "⚠️ リスク・偶発イベント (Risk)", category: CARD_CATEGORIES.RISK, description: "突発的な市場変動やアクシデントが発生！めくった瞬間にランダムなイベントが確定し、強制適用されます。", color: "#ff3838", icon: "🎲" },
  { id: "r3", title: "⚠️ リスク・偶発イベント (Risk)", category: CARD_CATEGORIES.RISK, description: "突発的な市場変動やアクシデントが発生！めくった瞬間にランダムなイベントが確定し、強制適用されます。", color: "#ff3838", icon: "🎲" },
];

/**
 * デッキをシャッフル生成
 */
export function generateShuffledDeck() {
  const deck = [];
  
  // 150枚の意思決定カード (Decision) を生成
  for (let i = 1; i <= 150; i++) {
    deck.push({
      id: `d_${i}`,
      title: `経営意思決定カード (Decision) #${i}`,
      category: CARD_CATEGORIES.DECISION,
      description: "あなたが経営者として、次の経営戦略アクション（仕入・製造・販売・雇用・投資等）を自由に選択して実行できます。",
      color: "#00f2fe",
      icon: "🧠"
    });
  }

  // 50枚のリスクカード (Risk) を生成
  for (let i = 1; i <= 50; i++) {
    deck.push({
      id: `r_${i}`,
      title: `⚠️ リスク・偶発イベント (Risk) #${i}`,
      category: CARD_CATEGORIES.RISK,
      description: "突発的な市場変動やアクシデントが発生！めくった瞬間にランダムなイベントが確定し、強制適用されます。",
      color: "#ff3838",
      icon: "🎲"
    });
  }

  // シャッフル
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * リスクカードをドローした際にランダムなリスクイベントを1つ決定する
 */
export function drawRandomRiskEvent() {
  const randomIndex = Math.floor(Math.random() * RISK_EVENTS.length);
  return { ...RISK_EVENTS[randomIndex] };
}
