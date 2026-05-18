/**
 * 戦略MG（製造業）NPC AI 意思決定エンジン
 */
import { CARD_TYPES } from './cards';
import { calculateFinancials } from './calculations';

export const DIFFICULTY_LEVELS = {
  EASY: "easy",     // 初級
  MEDIUM: "medium", // 中級
  HARD: "hard"      // 上級
};

/**
 * NPCの入札価格 (オークション) を自動決定する
 */
export function decideNpcBid(player, results, difficulty) {
  const { endingCount } = results.prod;
  if (endingCount <= 0) return 0; // 製品がない場合は入札に参加できない

  const cash = results.bookEndingCash;
  const rd = player.rdLevel || 0;
  const ad = player.adLevel || 0;

  // 基本入札価格の決定 (万円)
  let basePrice = 24; // デフォルト
  
  if (difficulty === DIFFICULTY_LEVELS.EASY) {
    basePrice = 20 + Math.floor(Math.random() * 4); // 20〜23万 (安値)
  } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
    basePrice = 24 + Math.floor(Math.random() * 4); // 24〜27万 (適正)
  } else if (difficulty === DIFFICULTY_LEVELS.HARD) {
    basePrice = 27 + Math.floor(Math.random() * 6); // 27〜32万 (高値・攻撃的)
  }

  // 研究開発 (R&D) や 広告 (AD) によるボーナス補正
  // MGルール：研究レベルが高いと付加価値の高い売り方ができる、広告があると優先権や加算がある
  const bonus = Math.floor(rd * 1.5) + Math.floor(ad * 1.0);
  
  return basePrice + bonus;
}

/**
 * NPCの手番意思決定を決定する
 * @returns {object} { type: CARD_TYPES, payload: {} }
 */
export function decideNpcAction(player, results, card, difficulty, materialsInMarket) {
  const cash = results.bookEndingCash;
  const currentPeriod = player.currentPeriod;
  const periodData = player.periods[currentPeriod];
  
  const matCount = results.mat.endingCount;
  const wipCount = results.wip.endingCount;
  const prodCount = results.prod.endingCount;
  
  const largeMachines = results.machines.large;
  const smallMachines = results.machines.small;
  const machineCapacity = (largeMachines * 3) + (smallMachines * 1); // 生産能力上限
  const workers = results.workers;

  // デフォルトアクション (何もしない/パス)
  const passAction = { type: "pass", payload: {}, log: "資金温存のためパスしました。" };

  switch (card.type) {
    
    // 1. 材料仕入 (ツ)
    case CARD_TYPES.PURCHASE: {
      if (materialsInMarket <= 0) return passAction;
      
      let targetQty = 1;
      let price = 1; // 仕入単価 ¥1万
      
      const maxBuy = Math.min(materialsInMarket, workers * 2);

      if (difficulty === DIFFICULTY_LEVELS.EASY) {
        targetQty = 1;
      } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
        targetQty = Math.min(maxBuy, Math.max(1, machineCapacity - matCount));
      } else if (difficulty === DIFFICULTY_LEVELS.HARD) {
        targetQty = maxBuy; // 買えるだけ買う
      }

      // 資金ショート防止
      if (cash <= targetQty * price) {
        targetQty = Math.floor(cash / price);
      }

      if (targetQty <= 0) return passAction;

      return {
        type: CARD_TYPES.PURCHASE,
        payload: { qty: targetQty, price },
        log: `材料を市場から ${targetQty} 個仕入れました。(¥${targetQty}万)`
      };
    }

    // 2. 製造 (コ・サ)
    case CARD_TYPES.PRODUCE: {
      // 投入 (コ) するか 完成 (サ) するかの判断
      // 原則：仕掛品があれば完成「サ」を優先、なければ投入「コ」
      
      if (wipCount > 0 && cash >= wipCount * 10) {
        // 完成加工 (サ) の決定
        let qty = wipCount;
        if (difficulty === DIFFICULTY_LEVELS.EASY) {
          qty = 1;
        } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
          qty = Math.min(wipCount, workers);
        } else {
          qty = wipCount; // 全て完成
        }

        if (cash < qty * 10) {
          qty = Math.floor(cash / 10);
        }

        if (qty > 0) {
          return {
            type: CARD_TYPES.PRODUCE,
            payload: { type: "complete", qty },
            log: `仕掛品 ${qty} 個を製品へ完成加工しました。(加工費: ¥${qty * 10}万)`
          };
        }
      }

      // 材料投入 (コ) の決定
      if (matCount > 0) {
        let qty = Math.min(matCount, machineCapacity);
        if (difficulty === DIFFICULTY_LEVELS.EASY) {
          qty = 1;
        } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
          qty = Math.min(qty, workers);
        }

        if (qty > 0) {
          return {
            type: CARD_TYPES.PRODUCE,
            payload: { type: "input", qty },
            log: `材料 ${qty} 個を工場ラインへ投入しました。(仕掛品化)`
          };
        }
      }

      return passAction;
    }

    // 3. 直接即時販売 (キ)
    case CARD_TYPES.SALE_DIRECT: {
      if (prodCount <= 0) return passAction;
      
      let price = 25; // 基本単価
      if (difficulty === DIFFICULTY_LEVELS.EASY) price = 23;
      if (difficulty === DIFFICULTY_LEVELS.HARD) price = 27; // 強気

      return {
        type: CARD_TYPES.SALE_DIRECT,
        payload: { price, qty: prodCount },
        log: `製品 ${prodCount} 個を市場へ直接即時販売しました。(単価: ¥${price}万, 合計: ¥${prodCount * price}万)`
      };
    }

    // 4. 機械購入 (ケ)
    case CARD_TYPES.BUY_MACHINE: {
      // 現金に余裕がある場合のみ購入
      if (difficulty === DIFFICULTY_LEVELS.EASY) {
        return passAction; // イージーは機械を買わない
      }

      if (difficulty === DIFFICULTY_LEVELS.MEDIUM && cash >= 150) {
        // 中級は小型機械を購入
        return {
          type: CARD_TYPES.BUY_MACHINE,
          payload: { type: "small" },
          log: "小型機械を ¥40万 で購入し、生産能力を高めました！"
        };
      }

      if (difficulty === DIFFICULTY_LEVELS.HARD) {
        if (cash >= 200) {
          return {
            type: CARD_TYPES.BUY_MACHINE,
            payload: { type: "large" },
            log: "大型機械を ¥80万 で電撃購入し、超攻撃的な大量生産体制へ移行しました！"
          };
        } else if (cash >= 100) {
          return {
            type: CARD_TYPES.BUY_MACHINE,
            payload: { type: "small" },
            log: "小型機械を ¥40万 で購入し、地盤を強化しました。"
          };
        } else if (cash >= 50 && (largeMachines + smallMachines > 0)) {
          return {
            type: CARD_TYPES.BUY_MACHINE,
            payload: { type: "attachment" },
            log: "機械アタッチメントを ¥10万 で購入し、生産ラインを微調整しました。"
          };
        }
      }

      return passAction;
    }

    // 5. 社員雇用 (シ)
    case CARD_TYPES.HIRE: {
      if (difficulty === DIFFICULTY_LEVELS.EASY) return passAction;
      
      const limit = difficulty === DIFFICULTY_LEVELS.MEDIUM ? 120 : 80;
      if (cash >= limit && workers < 6) {
        return {
          type: CARD_TYPES.HIRE,
          payload: {},
          log: `社員を1名新規雇用しました。(現在の社員数: ${workers + 1}人)`
        };
      }
      return passAction;
    }

    // 6. 長期借入金 (オ)
    case CARD_TYPES.LOAN: {
      // 資金が少ないか、上級で投資資金が欲しい場合
      if (cash < 50 || (difficulty === DIFFICULTY_LEVELS.HARD && cash < 120)) {
        return {
          type: CARD_TYPES.LOAN,
          payload: { amount: 50 },
          log: "資金調達のため、銀行から長期借入金 ¥50万 を融資させました。"
        };
      }
      return passAction;
    }

    // 7. 研究開発 (チ)
    case CARD_TYPES.RD: {
      if (difficulty !== DIFFICULTY_LEVELS.EASY && cash >= 60) {
        return {
          type: CARD_TYPES.RD,
          payload: {},
          log: "研究開発投資を実行し、経営技術レベルをアップしました！(付加価値向上)"
        };
      }
      return passAction;
    }

    // 8. 広告宣伝 (セ)
    case CARD_TYPES.AD: {
      if (difficulty !== DIFFICULTY_LEVELS.EASY && cash >= 40) {
        return {
          type: CARD_TYPES.AD,
          payload: {},
          log: "広告宣伝費 ¥10万 を支払い、オークション販売力を高めました。"
        };
      }
      return passAction;
    }

    // 9. 災害リスク：火災
    case CARD_TYPES.RISK_FIRE:
      return {
        type: CARD_TYPES.RISK_FIRE,
        payload: {},
        log: "⚠️ 工場で突発的な火災が発生！倉庫の材料2個が焼失しました。"
      };

    // 10. 災害リスク：製造ミス
    case CARD_TYPES.RISK_MISS:
      return {
        type: CARD_TYPES.RISK_MISS,
        payload: {},
        log: "💥重大な製造不良が発生！仕掛品1個が廃棄処分になりました。"
      };

    // 11. 災害リスク：盗難
    case CARD_TYPES.RISK_THEFT:
      return {
        type: CARD_TYPES.RISK_THEFT,
        payload: {},
        log: "🕵️ 倉庫にて製品の盗難被害が発生！完成品1個が紛失しました。"
      };

    default:
      return passAction;
  }
}
