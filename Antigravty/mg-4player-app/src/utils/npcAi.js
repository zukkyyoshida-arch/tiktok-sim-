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
 * ジュニア・ルール: 価格が安い順に落札されるため、AIは「確実に利益が出る範囲でできるだけ安い価格」を提示する！
 */
export function decideNpcBid(player, results, difficulty) {
  const { endingCount } = results.prod;
  if (endingCount <= 0) return 0; // 製品がない場合は入札に参加できない

  const cash = results.bookEndingCash;
  const rd = player.rdLevel || 0; // 青チップ枚数

  // 基本入札価格の決定 (万円)
  // 原価：材料費 (10〜15万) ＋ 投入・完成加工費 (3万) ≒ 13〜18万
  let basePrice = 22; // デフォルト
  
  if (difficulty === DIFFICULTY_LEVELS.EASY) {
    basePrice = 25 + Math.floor(Math.random() * 3); // 25〜27万 (高めなので落札されにくい)
  } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
    basePrice = 22 + Math.floor(Math.random() * 3); // 22〜24万 (適正・堅実)
  } else if (difficulty === DIFFICULTY_LEVELS.HARD) {
    basePrice = 19 + Math.floor(Math.random() * 3); // 19〜21万 (安値で攻めて落札を狙う)
  }

  // ジュニア・ルールにおいて、青チップ（研究開発）は「実質評価額を -2万/枚 補正する」ため、
  // AIはその補正アドバンテージ分だけ提示価格を高くしても落札しやすくなります。
  // そのため、青チップの枚数に応じて提示価格を少し上乗せします。
  const rdBonus = rd * 2;
  
  return Math.max(18, basePrice + rdBonus);
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
  const attachCount = results.machines.attachments || 0;
  
  // LEDGERから現在のワーカー数とセールスマン数を算出
  let workersProd = periodData.carryover.workersProd !== undefined ? periodData.carryover.workersProd : 2;
  let workersSales = periodData.carryover.workersSales !== undefined ? periodData.carryover.workersSales : 1;
  
  if (periodData.ledger) {
    periodData.ledger.forEach(entry => {
      if (entry.category === 'ソ' && entry.memo?.includes('新規採用（ワーカー）')) {
        workersProd += (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('新規採用（セールスマン）')) {
        workersSales += (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('配置転換（ワーカーに移動）')) {
        workersProd += (Number(entry.quantity) || 0);
        workersSales -= (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('配置転換（セールスマンに移動）')) {
        workersProd -= (Number(entry.quantity) || 0);
        workersSales += (Number(entry.quantity) || 0);
      }
    });
  }
  const workers = workersProd + workersSales;

  // ジュニア公式: ワーカー数に応じた機械の稼働判定
  let activeLarge = Math.min(largeMachines, workersProd);
  let activeSmall = Math.min(smallMachines, Math.max(0, workersProd - activeLarge));
  
  // アタッチメントは小型機械に対してのみ有効
  const activeAttach = Math.min(attachCount, activeSmall);
  
  // 基本生産能力: 大型4個、小型1個、アタッチ+1個
  const baseCapacity = (activeLarge * 4) + (activeSmall * 1) + activeAttach;
  
  // PAC生産性 (緑チップ) のブースト: 稼働している機械（大型+小型）1台につき+1個
  const pacBoost = player.hasPac ? (activeLarge + activeSmall) : 0;
  
  const prodCapacity = baseCapacity + pacBoost;


  // デフォルトアクション (何もしない/パス)
  const passAction = { type: "pass", payload: {}, log: "資金温存のためパスしました。" };

  switch (card.type) {
    
    // 1. 材料仕入 (ツ)
    case CARD_TYPES.PURCHASE: {
      if (materialsInMarket <= 0) return passAction;
      
      let targetQty = 1;
      let price = 12; // 基本仕入価格 (東京想定など)
      if (player.hasMerchandiser) price = 10; // マーチャンチップ所持時は 2万円引き！
      
      // 仕入上限は生産能力の2倍
      const maxBuy = Math.min(materialsInMarket, prodCapacity * 2);

      if (difficulty === DIFFICULTY_LEVELS.EASY) {
        targetQty = 1;
      } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
        targetQty = Math.min(maxBuy, Math.max(1, (prodCapacity * 2) - matCount));
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
        log: `材料を市場から ${targetQty} 個仕入れました。(¥${targetQty * price}万)`
      };
    }

    // 2. 製造 (コ・サ)
    case CARD_TYPES.PRODUCE: {
      // 投入 (コ) するか 完成 (サ) するかの判断
      // 原則：仕掛品があれば完成「サ」を優先、なければ投入「コ」
      
      // 完成加工 (サ) の決定: 加工費 ¥1万/個
      if (wipCount > 0 && cash >= wipCount * 1) {
        let qty = Math.min(wipCount, prodCapacity);
        if (difficulty === DIFFICULTY_LEVELS.EASY) {
          qty = 1;
        } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
          qty = Math.min(qty, workersProd);
        }

        if (cash < qty * 1) {
          qty = Math.floor(cash / 1);
        }

        if (qty > 0) {
          return {
            type: CARD_TYPES.PRODUCE,
            payload: { type: "complete", qty },
            log: `仕掛品 ${qty} 個を製品へ完成加工しました。(完成加工費: ¥${qty * 1}万、最大能力: ${prodCapacity}個)`
          };
        }
      }

      // 材料投入 (コ) の決定: 加工費 ¥2万/個
      if (matCount > 0 && cash >= matCount * 2) {
        let qty = Math.min(matCount, prodCapacity);
        if (difficulty === DIFFICULTY_LEVELS.EASY) {
          qty = 1;
        } else if (difficulty === DIFFICULTY_LEVELS.MEDIUM) {
          qty = Math.min(qty, workersProd);
        }

        if (cash < qty * 2) {
          qty = Math.floor(cash / 2);
        }

        if (qty > 0) {
          return {
            type: CARD_TYPES.PRODUCE,
            payload: { type: "input", qty },
            log: `材料 ${qty} 個を工場ラインへ投入しました。(投入加工費: ¥${qty * 2}万、最大能力: ${prodCapacity}個)`
          };
        }
      }

      return passAction;
    }

    // 3. 直接即時販売 (キ)
    case CARD_TYPES.SALE_DIRECT: {
      if (prodCount <= 0) return passAction;
      
      let price = 24; // 基本単価
      if (difficulty === DIFFICULTY_LEVELS.EASY) price = 22;
      if (difficulty === DIFFICULTY_LEVELS.HARD) price = 26; // 強気

      return {
        type: CARD_TYPES.SALE_DIRECT,
        payload: { price, qty: prodCount },
        log: `製品 ${prodCount} 個を市場へ直接即時販売しました。(単価: ¥${price}万, 合計: ¥${prodCount * price}万)`
      };
    }

    // 4. 機械購入 (ケ)
    // ジュニア単価：大型200万、小型100万、アタッチ20万
    case CARD_TYPES.BUY_MACHINE: {
      if (difficulty === DIFFICULTY_LEVELS.EASY) {
        return passAction; // イージーは機械を買わない
      }

      if (difficulty === DIFFICULTY_LEVELS.MEDIUM && cash >= 200) {
        // 中級は小型機械を購入
        return {
          type: CARD_TYPES.BUY_MACHINE,
          payload: { type: "small" },
          log: "小型機械を ¥100万 で購入し、生産能力を高めました！"
        };
      }

      if (difficulty === DIFFICULTY_LEVELS.HARD) {
        if (cash >= 350) {
          return {
            type: CARD_TYPES.BUY_MACHINE,
            payload: { type: "large" },
            log: "大型機械を ¥200万 で購入し、大量生産体制へ移行しました！"
          };
        } else if (cash >= 200) {
          return {
            type: CARD_TYPES.BUY_MACHINE,
            payload: { type: "small" },
            log: "小型機械を ¥100万 で購入し、生産能力を拡大しました。"
          };
        } else if (cash >= 50 && smallMachines > attachCount) {
          return {
            type: CARD_TYPES.BUY_MACHINE,
            payload: { type: "attachment" },
            log: "アタッチメントを ¥20万 で購入し、小型機械をパワーアップしました。"
          };
        }
      }

      return passAction;
    }

    // 5. 社員雇用 (ソ)
    // 採用費：¥5万
    case CARD_TYPES.HIRE: {
      if (difficulty === DIFFICULTY_LEVELS.EASY) return passAction;
      
      const limit = difficulty === DIFFICULTY_LEVELS.MEDIUM ? 100 : 60;
      if (cash >= limit && workers < 6) {
        // 機械の合計台数がワーカーの数より多ければ、ワーカー（prod）を優先雇用、さもなくばセールスマン（sales）
        const machineCount = largeMachines + smallMachines;
        const hireRole = machineCount > workersProd ? 'prod' : 'sales';
        
        return {
          type: CARD_TYPES.HIRE,
          payload: { type: hireRole },
          log: `社員を1名新規採用しました (${hireRole === 'prod' ? '⚙️ワーカー' : '💼セールスマン'}、採用費: ¥5万、合計社員数: ${workers + 1}人)`
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

/**
 * NPCのルールB（手番前・任意アクション）の意思決定を決定する
 * 資金や所持チップ・人員比率に応じて賢く判断し、何もしない場合は { type: "end" } を返す
 */
export function decideNpcRuleB(player, results, difficulty) {
  const cash = results.bookEndingCash;
  const currentPeriod = player.currentPeriod;
  const periodData = player.periods[currentPeriod];
  
  const prodCount = results.prod.endingCount;
  const largeMachines = results.machines.large;
  const smallMachines = results.machines.small;
  
  // LEDGERから現在のワーカー数とセールスマン数を算出
  let workersProd = periodData.carryover.workersProd !== undefined ? periodData.carryover.workersProd : 2;
  let workersSales = periodData.carryover.workersSales !== undefined ? periodData.carryover.workersSales : 1;
  
  if (periodData.ledger) {
    periodData.ledger.forEach(entry => {
      if (entry.category === 'ソ' && entry.memo?.includes('新規採用（ワーカー）')) {
        workersProd += (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('新規採用（セールスマン）')) {
        workersSales += (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('配置転換（ワーカーに移動）')) {
        workersProd += (Number(entry.quantity) || 0);
        workersSales -= (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('配置転換（セールスマンに移動）')) {
        workersProd -= (Number(entry.quantity) || 0);
        workersSales += (Number(entry.quantity) || 0);
      }
    });
  }
  
  // 借入残高の算出
  let totalLoan = periodData.carryover.loan || 0;
  if (periodData.ledger) {
    periodData.ledger.forEach(entry => {
      if (entry.category === 'オ') totalLoan += (Number(entry.amount) || 0);
      if (entry.category === 'ナ') totalLoan -= (Number(entry.amount) || 0);
    });
  }

  // 純資産の算出
  const netAssets = results.bs.totalNetAssets || 100;

  // 1. 資金が極度に少なく、借入余力がある場合は銀行借入 (オ)
  if (cash < 20 && currentPeriod >= 2) {
    const loanLimit = currentPeriod <= 3 ? netAssets * 2 : netAssets * 3;
    if (totalLoan + 50 <= loanLimit) {
      return {
        type: "loan",
        payload: { amount: 50 },
        log: "手番前資金ショートを防ぐため、銀行から ¥50万 を借入れました。"
      };
    }
  }

  // 2. 資金に余裕がある場合、使い捨て優秀チップを優先購入 (buy_chip)
  if (difficulty !== DIFFICULTY_LEVELS.EASY && cash >= 40) {
    // 保険 (黄) - 災害対策として極めて優先度が高い
    if (!player.hasInsurance && cash >= 35) {
      return {
        type: "buy_chip",
        payload: { chipType: "insurance" },
        log: "火災や盗難に備えて、損害保険（黄チップ）を ¥5万 で購入しました。"
      };
    }
    
    // PAC生産性 (緑) - 機械が余っていてワーカーがいる場合
    if (!player.hasPac && (largeMachines + smallMachines > workersProd) && cash >= 60) {
      return {
        type: "buy_chip",
        payload: { chipType: "pac" },
        log: "生産効率を高めるため、PAC生産性（緑チップ）を ¥10万 で購入しました。"
      };
    }

    // マーチャンダイザー (緑) - 材料を安く買うため
    if (!player.hasMerchandiser && cash >= 70) {
      return {
        type: "buy_chip",
        payload: { chipType: "merchandiser" },
        log: "仕入コスト削減のため、マーチャンダイザー（緑チップ）を ¥10万 で購入しました。"
      };
    }

    // マーケットリサーチ (緑) - 落札単価+2万のため
    if (!player.hasResearch && prodCount > 0 && cash >= 60) {
      return {
        type: "buy_chip",
        payload: { chipType: "research" },
        log: "販売単価ブーストのため、マーケットリサーチ（緑チップ）を ¥10万 で購入しました。"
      };
    }
  }

  // 3. 人員のミスマッチがある場合は配置転換 (transfer_worker)
  if (difficulty === DIFFICULTY_LEVELS.HARD && cash >= 30) {
    // 機械が稼働していないのにセールスマンが余っている場合 ➔ ワーカーへ
    if (largeMachines + smallMachines > workersProd && workersSales >= 2) {
      return {
        type: "transfer_worker",
        payload: { type: "prod" },
        log: "稼働機械を増やすため、セールスマンをワーカーへ配置転換しました。(研修費 ¥5万)"
      };
    }
    // 製品が山積み（3個以上）なのにセールスマンが0または1人しかいない場合 ➔ セールスマンへ
    if (prodCount >= 3 && workersSales <= 1 && workersProd >= 3) {
      return {
        type: "transfer_worker",
        payload: { type: "sales" },
        log: "製品販売力をブーストするため、ワーカーをセールスマンへ配置転換しました。(研修費 ¥5万)"
      };
    }
  }

  // 4. 資金が極めて豊富で、借入残高がある場合は任意返済 (repay)
  if (cash >= 180 && totalLoan >= 50) {
    return {
      type: "repay",
      payload: { amount: 50 },
      log: "利息負担を軽減するため、借入金 ¥50万 を任意返済しました。"
    };
  }

  // 5. 実行するものがない場合は終了
  return {
    type: "end",
    payload: {},
    log: "手番前アクションを終了しました。"
  };
}
