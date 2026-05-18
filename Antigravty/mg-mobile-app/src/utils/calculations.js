/**
 * 戦略MG（製造業）計算エンジン
 * スプレッドシートの全ての仕訳・在庫棚卸・原価計算・決算書（P/L, B/S, C/F）ロジックを完全再現します。
 */

// 勘定科目の定義
export const CATEGORIES = {
  // 入金系 (Inflow)
  "ネ": { label: "売掛・売上", type: "inflow", color: "pink", symbol: "ネ" },
  "ア": { label: "売掛金入金", type: "inflow", color: "pink", symbol: "ア" },
  "イ": { label: "機械売却", type: "inflow", color: "pink", symbol: "イ" },
  "エ": { label: "受取保険金", type: "inflow", color: "pink", symbol: "エ" },
  "オ": { label: "借入金", type: "inflow", color: "pink", symbol: "オ" },
  "カ": { label: "資本金増加", type: "inflow", color: "pink", symbol: "カ" },
  "キ": { label: "現金売上", type: "inflow", color: "pink", symbol: "キ" },
  
  // 出金系 (Outflow)
  "ケ": { label: "機械工具購入", type: "outflow", color: "purple", symbol: "ケ" },
  "コ": { label: "材料投入費", type: "outflow", color: "green", symbol: "コ" },
  "サ": { label: "完成費", type: "outflow", color: "green", symbol: "サ" },
  "シ": { label: "労務費", type: "outflow", color: "blue", symbol: "シ" },
  "ス": { label: "製造経費", type: "outflow", color: "blue", symbol: "ス" },
  "セ": { label: "販売費", type: "outflow", color: "blue", symbol: "セ" },
  "ソ": { label: "一般管理費", type: "outflow", color: "blue", symbol: "ソ" },
  "タ": { label: "営業外費用", type: "outflow", color: "blue", symbol: "タ" },
  "チ": { label: "研究開発費", type: "outflow", color: "blue", symbol: "チ" },
  "ツ": { label: "材料仕入", type: "outflow", color: "green", symbol: "ツ" },
  "ナ": { label: "借入金返済", type: "outflow", color: "yellow", symbol: "ナ" },
  "ニ": { label: "納税", type: "outflow", color: "yellow", symbol: "ニ" },
  "ヌ": { label: "買掛金支払", type: "outflow", color: "yellow", symbol: "ヌ" }
};

/**
 * 初期状態（第1期のデフォルト値など）
 */
export const DEFAULT_PERIOD_DATA = {
  carryover: {
    cash: 300,              // ⑬現金
    materialsCount: 0,      // ⑧材料個数
    materialsValue: 0,      // ⑧材料金額
    wipCount: 0,            // ⑯仕掛品個数
    wipValue: 0,            // ⑯仕掛品金額
    productCount: 0,        // ⑧製品個数
    productValue: 0,        // ⑧製品金額
    machinesCount: 0,       // ⑭機械台数 (合計)
    machinesValue: 0,       // ⑭機械金額 (合計)
    loan: 0,                // ⑰借入金
    receivables: 0,         // ⑱売掛金
    payables: 0,            // ⑲買掛金
    retainedEarnings: 0,    // ㉒繰越利益剰余金
    capital: 300,           // 資本金 (初期値300)
    
    // 機械内訳
    largeMachines: 0,       // 大型機械台数
    smallMachines: 0,       // 小型機械台数
    attachments: 0          // アタッチメント数
  },
  ledger: [],               // 現金出納帳
  actuals: {
    actualCash: 300,
    actualMaterials: 0,
    actualWip: 0,
    actualProduct: 0,
    fireCount: 0,           // 火災（材料）
    missCount: 0,           // 製造ミス（仕掛品）
    theftCount: 0           // 盗難（製品）
  },
  budget: {
    targetG: 0,             // 目標G
    // 固定費予算
    laborBudget: 0,
    manufacturingBudget: 0,
    depreciationBudget: 0,
    salesBudget: 0,
    adminBudget: 0,
    nonOperatingBudget: 0,
    rdBudget: 0
  }
};

/**
 * 帳簿データを元にすべての数値を再計算するメイン関数
 */
export function calculateFinancials(carryover, ledger, actuals) {
  // 1. 現金の出入金集計
  let cashInflow = 0;
  let cashOutflow = 0;
  
  // 出納帳カテゴリ別の集計
  const ledgerTotals = {};
  Object.keys(CATEGORIES).forEach(k => {
    ledgerTotals[k] = { amount: 0, quantity: 0 };
  });

  ledger.forEach(entry => {
    const amt = Number(entry.amount) || 0;
    const qty = Number(entry.quantity) || 0;
    const cat = entry.category;
    
    if (CATEGORIES[cat]) {
      ledgerTotals[cat].amount += amt;
      ledgerTotals[cat].quantity += qty;
      
      if (CATEGORIES[cat].type === "inflow") {
        cashInflow += amt;
      } else {
        cashOutflow += amt;
      }
    }
  });

  const bookEndingCash = carryover.cash + cashInflow - cashOutflow;

  // 2. 在庫・原価計算 (材料 -> 仕掛品 -> 製品)
  
  // A. 材料 (Materials)
  const matBeginningCount = carryover.materialsCount || 0;
  const matBeginningValue = carryover.materialsValue || 0;
  const matPurchaseCount = ledgerTotals["ツ"].quantity;
  const matPurchaseValue = ledgerTotals["ツ"].amount;
  
  const matTotalCount = matBeginningCount + matPurchaseCount;
  const matTotalValue = matBeginningValue + matPurchaseValue;
  
  // 平均単価の算出
  const matUnitCost = matTotalCount > 0 ? (matTotalValue / matTotalCount) : 0;
  
  // 投入 (コ)
  const matInputCount = ledgerTotals["コ"].quantity;
  const matInputValue = matInputCount * matUnitCost;
  
  // 事故災害：火災 (材料)
  const fireCount = actuals.fireCount || 0;
  const matFireValue = fireCount * matUnitCost;
  
  // 材料の次期繰越 (理論値)
  const matEndingCount = matTotalCount - matInputCount - fireCount;
  const matEndingValue = matEndingCount * matUnitCost;

  // B. 仕掛品 (Work-in-Progress)
  const wipBeginningCount = carryover.wipCount || 0;
  const wipBeginningValue = carryover.wipValue || 0;
  
  // WIPへのインプット：材料投入金額 + 完成費 (サ) の支払金額
  const wipInputCount = matInputCount; 
  const wipInputValue = matInputValue + ledgerTotals["サ"].amount; // 材料費 + 完成加工費
  
  const wipTotalCount = wipBeginningCount + wipInputCount;
  const wipTotalValue = wipBeginningValue + wipInputValue;
  
  const wipUnitCost = wipTotalCount > 0 ? (wipTotalValue / wipTotalCount) : 0;
  
  // 完成 (サ の生産個数)
  const wipCompletedCount = ledgerTotals["サ"].quantity;
  const wipCompletedValue = wipCompletedCount * wipUnitCost;
  
  // 事故災害：製造ミス (仕掛品)
  const missCount = actuals.missCount || 0;
  const wipMissValue = missCount * wipUnitCost;
  
  // 仕掛品の次期繰越 (理論値)
  const wipEndingCount = wipTotalCount - wipCompletedCount - missCount;
  const wipEndingValue = wipEndingCount * wipUnitCost;

  // C. 製品 (Finished Goods)
  const prodBeginningCount = carryover.productCount || 0;
  const prodBeginningValue = carryover.productValue || 0;
  const prodCompletedCount = wipCompletedCount;
  const prodCompletedValue = wipCompletedValue;
  
  const prodTotalCount = prodBeginningCount + prodCompletedCount;
  const prodTotalValue = prodBeginningValue + prodCompletedValue;
  
  const prodUnitCost = prodTotalCount > 0 ? (prodTotalValue / prodTotalCount) : 0;
  
  // 売上個数 (キ + ネ の合計個数)
  const salesCount = ledgerTotals["キ"].quantity + ledgerTotals["ネ"].quantity;
  const cogsValue = salesCount * prodUnitCost; // 売上原価
  
  // 事故災害：盗難 (製品)
  const theftCount = actuals.theftCount || 0;
  const prodTheftValue = theftCount * prodUnitCost;
  
  // 製品の次期繰越 (理論値)
  const prodEndingCount = prodTotalCount - salesCount - theftCount;
  const prodEndingValue = prodEndingCount * prodUnitCost;

  // 3. 機械資産の計算
  // 減価償却費の決定 (大型機械・小型機械・アタッチメントの台数に基づく固定費)
  // 機械内訳は、期首＋購入（ケ の数量）−売却（イ の数量）
  // 簡略化のため、機械の台数は前期繰越に「ケ」で買った分を加算、売却「イ」を減算
  const largeMachines = carryover.largeMachines || 0;
  const smallMachines = carryover.smallMachines || 0;
  const attachments = carryover.attachments || 0;
  
  // 減価償却費 (大型: 20/台, 小型: 10/台, アタッチメント: 2/台)
  const depreciation = (largeMachines * 20) + (smallMachines * 10) + (attachments * 2);
  
  // 購入された機械工具 (ケ)
  const purchasedMachineValue = ledgerTotals["ケ"].amount;
  // 機械資産の期末残高 (理論値)
  // 期首金額 + 新規購入 - 減価償却 (売却があった場合は売却価値を引くが、ここでは簡易化し期末簿価に反映)
  const bookEndingMachines = Math.max(0, carryover.machinesValue + purchasedMachineValue - depreciation - ledgerTotals["イ"].amount);

  // 4. P/L (変動損益計算書) の計算
  const salesRevenue = ledgerTotals["キ"].amount + ledgerTotals["ネ"].amount; // 売上高 PQ
  const variableCost = cogsValue; // 売上原価 vPQ (変動費)
  const margin = salesRevenue - variableCost; // 付加価値 mPQ
  const marginRatio = salesRevenue > 0 ? (margin / salesRevenue) * 100 : 0; // m率
  
  // 固定費 F (シ, ス, セ, ソ, タ, チ + 減価償却)
  // 注: サ(完成費)、コ(投入費)、ツ(材料)、ケ(機械)、ナ(借入返済)、ニ(納税)、ヌ(買掛支払)は固定費ではない
  const laborCost = ledgerTotals["シ"].amount; // 労務費
  const manufacturingFixed = ledgerTotals["ス"].amount + depreciation; // 製造固定費 (製造経費 + 減価償却)
  const salesCost = ledgerTotals["セ"].amount; // 販売費
  const adminCost = ledgerTotals["ソ"].amount; // 一般管理費
  const rdCost = ledgerTotals["チ"].amount; // 研究開発費
  const nonOperatingCost = ledgerTotals["タ"].amount; // 営業外費用
  
  const fixedCost = laborCost + manufacturingFixed + salesCost + adminCost + rdCost + nonOperatingCost; // 固定費合計 F
  
  const operatingProfit = margin - fixedCost; // 経常利益 G
  const fmRatio = margin > 0 ? (fixedCost / margin) * 100 : 0; // f/m比率

  // 特別損益 (災害損失 + 受取保険金など)
  // 事故災害損失 = 火災金額 + 製造ミス金額 + 盗難金額
  const accidentLoss = matFireValue + wipMissValue + prodTheftValue;
  const extraordinaryLoss = accidentLoss;
  const extraordinaryGain = ledgerTotals["エ"].amount + ledgerTotals["イ"].amount; // 保険金 + 機械売却収入
  const extraordinaryProfit = extraordinaryGain - extraordinaryLoss;

  const profitBeforeTax = operatingProfit + extraordinaryProfit; // 税引前当期純利益

  // 法人税等の計算
  // ルール: 前期繰越利益剰余金がマイナスで合計(税引前＋前期繰越)がプラスなら合計の50%。
  // 前期繰越利益剰余金がプラスなら税引前当期純利益の50%。
  const priorRetained = carryover.retainedEarnings || 0;
  const totalTaxBase = profitBeforeTax + priorRetained;
  let corporateTax = 0;
  
  if (profitBeforeTax > 0) {
    if (priorRetained < 0) {
      corporateTax = totalTaxBase > 0 ? Math.round(totalTaxBase * 0.5) : 0;
    } else {
      corporateTax = Math.round(profitBeforeTax * 0.5);
    }
  }

  const netProfit = profitBeforeTax - corporateTax; // 当期純利益
  const endingRetained = priorRetained + netProfit; // 次期繰越利益剰余金

  // 5. B/S (貸借対照表) の計算
  const endingCash = bookEndingCash;
  // 売掛金: 期首 + 新規売掛発生(ネ) - 回収(ア)
  const endingReceivables = Math.max(0, carryover.receivables + ledgerTotals["ネ"].amount - ledgerTotals["ア"].amount);
  
  // 買掛金: 期首 + 新規材料仕入(ツ) - 支払(ヌ)
  const endingPayables = Math.max(0, carryover.payables + ledgerTotals["ツ"].amount - ledgerTotals["ヌ"].amount);
  
  // 借入金: 期首 + 新規借入(オ) - 返済(ナ)
  const endingLoans = Math.max(0, carryover.loan + ledgerTotals["オ"].amount - ledgerTotals["ナ"].amount);
  
  // 資産合計
  const totalCurrentAssets = endingCash + endingReceivables + matEndingValue + wipEndingValue + prodEndingValue;
  const totalFixedAssets = bookEndingMachines;
  const totalAssets = totalCurrentAssets + totalFixedAssets;

  // 負債合計
  const unpaidTax = corporateTax; // 未払法人税
  const totalLiabilities = endingPayables + endingLoans + unpaidTax;

  // 純資産合計
  const endingCapital = carryover.capital + ledgerTotals["カ"].amount; // 資本金
  const totalNetAssets = endingCapital + endingRetained;
  
  const totalLiabilitiesAndNetAssets = totalLiabilities + totalNetAssets;

  // B/S不一致（バランスエラー）のチェック
  const bsDifference = Math.abs(totalAssets - totalLiabilitiesAndNetAssets);

  // 6. C/F (キャッシュフロー計算書)
  // 営業キャッシュフロー
  const operatingCF = 
    profitBeforeTax 
    + depreciation 
    - (endingReceivables - carryover.receivables) 
    - (matEndingValue - matBeginningValue) 
    - (wipEndingValue - wipBeginningValue) 
    - (prodEndingValue - prodBeginningValue) 
    + (endingPayables - carryover.payables)
    - ledgerTotals["ニ"].amount; // 納税出金
  
  // 投資キャッシュフロー
  const investingCF = extraordinaryGain - purchasedMachineValue; // 売却/保険収入 - 新規購入
  
  // 財務キャッシュフロー
  const financingCF = ledgerTotals["カ"].amount + ledgerTotals["オ"].amount - ledgerTotals["ナ"].amount; // 資本金増 + 新規借入 - 返済
  
  const freeCF = operatingCF + investingCF;
  const totalCF = freeCF + financingCF;

  // 評価ランク (経営戦略分析用)
  let evaluationRank = "C";
  if (operatingProfit >= 500) evaluationRank = "S";
  else if (operatingProfit >= 200) evaluationRank = "A";
  else if (operatingProfit >= 50) evaluationRank = "B";

  return {
    bookEndingCash,
    cashInflow,
    cashOutflow,
    
    // 原価・在庫
    mat: {
      beginningCount: matBeginningCount,
      beginningValue: matBeginningValue,
      purchaseCount: matPurchaseCount,
      purchaseValue: matPurchaseValue,
      totalCount: matTotalCount,
      totalValue: matTotalValue,
      unitCost: matUnitCost,
      inputCount: matInputCount,
      inputValue: matInputValue,
      fireCount: fireCount,
      fireValue: matFireValue,
      endingCount: matEndingCount,
      endingValue: matEndingValue
    },
    wip: {
      beginningCount: wipBeginningCount,
      beginningValue: wipBeginningValue,
      inputCount: wipInputCount,
      inputValue: wipInputValue,
      totalCount: wipTotalCount,
      totalValue: wipTotalValue,
      unitCost: wipUnitCost,
      completedCount: wipCompletedCount,
      completedValue: wipCompletedValue,
      missCount: missCount,
      missValue: wipMissValue,
      endingCount: wipEndingCount,
      endingValue: wipEndingValue
    },
    prod: {
      beginningCount: prodBeginningCount,
      beginningValue: prodBeginningValue,
      completedCount: prodCompletedCount,
      completedValue: prodCompletedValue,
      totalCount: prodTotalCount,
      totalValue: prodTotalValue,
      unitCost: prodUnitCost,
      salesCount: salesCount,
      cogsValue: cogsValue,
      theftCount: theftCount,
      theftValue: prodTheftValue,
      endingCount: prodEndingCount,
      endingValue: prodEndingValue
    },
    
    // 機械情報
    machines: {
      large: largeMachines,
      small: smallMachines,
      attachments: attachments,
      purchased: purchasedMachineValue,
      depreciation: depreciation,
      endingValue: bookEndingMachines
    },

    // P/L項目
    pl: {
      salesRevenue,
      variableCost,
      margin,
      marginRatio,
      fixedCost,
      laborCost,
      manufacturingFixed,
      salesCost,
      adminCost,
      rdCost,
      nonOperatingCost,
      operatingProfit,
      fmRatio,
      extraordinaryGain,
      extraordinaryLoss,
      extraordinaryProfit,
      profitBeforeTax,
      corporateTax,
      netProfit,
      endingRetained
    },

    // B/S項目
    bs: {
      cash: endingCash,
      receivables: endingReceivables,
      materialsValue: matEndingValue,
      wipValue: wipEndingValue,
      productValue: prodEndingValue,
      totalCurrentAssets,
      fixedAssets: bookEndingMachines,
      totalAssets,
      
      payables: endingPayables,
      loans: endingLoans,
      unpaidTax,
      totalLiabilities,
      
      capital: endingCapital,
      retainedEarnings: endingRetained,
      totalNetAssets,
      totalLiabilitiesAndNetAssets,
      difference: bsDifference
    },

    // C/F項目
    cf: {
      operatingCF,
      investingCF,
      financingCF,
      freeCF,
      totalCF
    },

    rank: evaluationRank
  };
}

/**
 * 予定計画 (Budget) の計算ロジック
 */
export function calculateBudget(budget, carryover) {
  const G = Number(budget.targetG) || 0;
  
  // 固定費合計
  const F = 
    (Number(budget.laborBudget) || 0) +
    (Number(budget.manufacturingBudget) || 0) +
    (Number(budget.depreciationBudget) || 0) +
    (Number(budget.salesBudget) || 0) +
    (Number(budget.adminBudget) || 0) +
    (Number(budget.nonOperatingBudget) || 0) +
    (Number(budget.rdBudget) || 0);

  // 必要MQ = G + F
  const requiredMQ = G + F;
  
  return {
    fixedCostTotal: F,
    requiredMQ
  };
}
