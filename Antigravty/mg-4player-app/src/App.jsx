import React, { useState, useEffect } from 'react';
import { calculateFinancials, DEFAULT_PERIOD_DATA } from './utils/calculations';
import { generateShuffledDeck, CARD_CATEGORIES, drawRandomRiskEvent } from './utils/cards';
import { decideNpcAction, decideNpcBid, decideNpcRuleB, DIFFICULTY_LEVELS } from './utils/npcAi';
import { 
  playDrawSound, 
  playActionSound, 
  playRiskWarningSound, 
  playRiskConfirmSound, 
  playFanfareSound,
  setSoundEnabled,
  getSoundEnabled
} from './utils/soundEffects';

import GlobalDashboard from './components/GlobalDashboard';
import DigitalBoard from './components/DigitalBoard';
import CashLedger from './components/CashLedger';
import FinancialStatements from './components/FinancialStatements';
import PeriodEndWizard from './components/PeriodEndWizard';
import PriorPeriodCarryover from './components/PriorPeriodCarryover';

// --- 安全な localStorage ラッパー ---
const safeLocalStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage is sandboxed or inaccessible, using memory fallback.", e);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
  }
};

// 初期プレイヤーデータ定義 (自分 + 3NPC)
const INITIAL_PLAYERS = [
  {
    id: 0,
    name: "ずっきー (あなた)",
    color: "#00f2fe",
    isNpc: false,
    difficulty: "medium",
    rdLevel: 0,
    adLevel: 0,
    hasInsurance: false,
    hasPac: false,
    hasMerchandiser: false,
    hasResearch: false,
    currentPeriod: 1,
    stats: {
      totalDecisionTime: 0,
      decisionCount: 0,
      maxSingleSaleQty: 0,
      stockoutCount: 0,
      maxAdLevel: 0,
      maxRdLevel: 0
    },
    periods: {
      1: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      2: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      3: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      4: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      5: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA))
    }
  },
  {
    id: 1,
    name: "A社 (ライバル/初級)",
    color: "#ff007f",
    isNpc: true,
    difficulty: DIFFICULTY_LEVELS.EASY,
    rdLevel: 0,
    adLevel: 0,
    hasInsurance: false,
    hasPac: false,
    hasMerchandiser: false,
    hasResearch: false,
    currentPeriod: 1,
    stats: {
      totalDecisionTime: 0,
      decisionCount: 0,
      maxSingleSaleQty: 0,
      stockoutCount: 0,
      maxAdLevel: 0,
      maxRdLevel: 0
    },
    periods: {
      1: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      2: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      3: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      4: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      5: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA))
    }
  },
  {
    id: 2,
    name: "B社 (ライバル/中級)",
    color: "#05ffa1",
    isNpc: true,
    difficulty: DIFFICULTY_LEVELS.MEDIUM,
    rdLevel: 0,
    adLevel: 0,
    hasInsurance: false,
    hasPac: false,
    hasMerchandiser: false,
    hasResearch: false,
    currentPeriod: 1,
    stats: {
      totalDecisionTime: 0,
      decisionCount: 0,
      maxSingleSaleQty: 0,
      stockoutCount: 0,
      maxAdLevel: 0,
      maxRdLevel: 0
    },
    periods: {
      1: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      2: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      3: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      4: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      5: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA))
    }
  },
  {
    id: 3,
    name: "C社 (ライバル/上級)",
    color: "#ffd000",
    isNpc: true,
    difficulty: DIFFICULTY_LEVELS.HARD,
    rdLevel: 0,
    adLevel: 0,
    hasInsurance: false,
    hasPac: false,
    hasMerchandiser: false,
    hasResearch: false,
    currentPeriod: 1,
    stats: {
      totalDecisionTime: 0,
      decisionCount: 0,
      maxSingleSaleQty: 0,
      stockoutCount: 0,
      maxAdLevel: 0,
      maxRdLevel: 0
    },
    periods: {
      1: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      2: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      3: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      4: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      5: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA))
    }
  }
];

const INITIAL_MARKETS = {
  sapporo: { id: "sapporo", name: "札幌市場", materials: 3, maxMaterials: 3, baseFreight: 4, salesHistory: [] },
  sendai: { id: "sendai", name: "仙台市場", materials: 4, maxMaterials: 4, baseFreight: 3, salesHistory: [] },
  tokyo: { id: "tokyo", name: "東京市場", materials: 6, maxMaterials: 6, baseFreight: 0, salesHistory: [] },
  nagoya: { id: "nagoya", name: "名古屋市場", materials: 9, maxMaterials: 9, baseFreight: 2, salesHistory: [] },
  osaka: { id: "osaka", name: "大阪市場", materials: 13, maxMaterials: 13, baseFreight: 3, salesHistory: [] },
  fukuoka: { id: "fukuoka", name: "福岡市場", materials: 20, maxMaterials: 20, baseFreight: 5, salesHistory: [] }
};

function App() {
  const [theme, setTheme] = useState(() => safeLocalStorage.getItem('mg4_theme_v3') || 'dark');
  
  const [players, setPlayers] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_players_data_ai_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4 && parsed[0].periods) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse players data v3", e);
      }
    }
    return JSON.parse(JSON.stringify(INITIAL_PLAYERS));
  });

  const [turnOrder, setTurnOrder] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_turn_order_v3');
    if (saved) return JSON.parse(saved);
    return [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  });

  const [orderIndex, setOrderIndex] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_order_index_v3');
    return saved ? Number(saved) : 0;
  });

  const activePlayerIdx = turnOrder[orderIndex] !== undefined ? turnOrder[orderIndex] : 0;

  const [commonPeriod, setCommonPeriod] = useState(() => Number(safeLocalStorage.getItem('mg4_common_period_v3')) || 1);
  const [commonTurn, setCommonTurn] = useState(() => Number(safeLocalStorage.getItem('mg4_common_turn_v3')) || 0);

  const [deck, setDeck] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_deck_v3');
    return saved ? JSON.parse(saved) : generateShuffledDeck();
  });
  
  const [currentCard, setCurrentCard] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_current_card_v3');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeRiskEvent, setActiveRiskEvent] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_active_risk_v3');
    return saved ? JSON.parse(saved) : null;
  });

  const [phase, setPhase] = useState(() => safeLocalStorage.getItem('mg4_phase_v3') || 'ruleB'); // ruleB, draw, action, resolved

  const [markets, setMarkets] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_markets_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.tokyo) {
          return parsed;
        }
      } catch (e) {}
    }
    return JSON.parse(JSON.stringify(INITIAL_MARKETS));
  });

  const [gameLogs, setGameLogs] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_game_logs_v3');
    return saved ? JSON.parse(saved) : ["🎲 戦略MG 1人プレイ対戦ゲームが開始しました！手番順がシャッフルされました。"];
  });

  const [activeTab, setActiveTab] = useState('gameboard');
  const [initialCapital, setInitialCapital] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_initial_capital');
    return saved ? Number(saved) : 300; // デフォルト 300万円
  });

  useEffect(() => {
    safeLocalStorage.setItem('mg4_initial_capital', String(initialCapital));
  }, [initialCapital]);

  const [turnStartTime, setTurnStartTime] = useState(Date.now());
  
  // 効果音設定のロード
  const [soundOn, setSoundOn] = useState(() => {
    const saved = safeLocalStorage.getItem('mg4_sound_on_v3');
    return saved !== 'false'; // デフォルト true
  });

  // --- 自動セーブ ---
  useEffect(() => {
    safeLocalStorage.setItem('mg4_players_data_ai_v3', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    safeLocalStorage.setItem('mg4_turn_order_v3', JSON.stringify(turnOrder));
    safeLocalStorage.setItem('mg4_order_index_v3', String(orderIndex));
  }, [turnOrder, orderIndex]);

  useEffect(() => {
    safeLocalStorage.setItem('mg4_common_period_v3', String(commonPeriod));
    safeLocalStorage.setItem('mg4_common_turn_v3', String(commonTurn));
  }, [commonPeriod, commonTurn]);

  useEffect(() => {
    safeLocalStorage.setItem('mg4_deck_v3', JSON.stringify(deck));
    if (currentCard) {
      safeLocalStorage.setItem('mg4_current_card_v3', JSON.stringify(currentCard));
    } else {
      safeLocalStorage.removeItem('mg4_current_card_v3');
    }
    if (activeRiskEvent) {
      safeLocalStorage.setItem('mg4_active_risk_v3', JSON.stringify(activeRiskEvent));
    } else {
      safeLocalStorage.removeItem('mg4_active_risk_v3');
    }
    safeLocalStorage.setItem('mg4_phase_v3', phase);
    safeLocalStorage.setItem('mg4_markets_v3', JSON.stringify(markets));
    safeLocalStorage.setItem('mg4_game_logs_v3', JSON.stringify(gameLogs));
  }, [deck, currentCard, activeRiskEvent, phase, markets, gameLogs]);

  useEffect(() => {
    const body = document.body;
    if (theme === 'light') {
      body.classList.add('light-theme');
    } else {
      body.classList.remove('light-theme');
    }
    safeLocalStorage.setItem('mg4_theme_v3', theme);
  }, [theme]);

  // 効果音設定の適用
  useEffect(() => {
    setSoundEnabled(soundOn);
    safeLocalStorage.setItem('mg4_sound_on_v3', String(soundOn));
  }, [soundOn]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const activePlayer = players[activePlayerIdx] || players[0];
  const activePeriod = activePlayer.currentPeriod;
  const currentData = activePlayer.periods[activePeriod] || JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA));
  const results = calculateFinancials(currentData.carryover, currentData.ledger, currentData.actuals);

  const addLog = (msg) => {
    setGameLogs(prev => [msg, ...prev].slice(0, 100));
  };

  // --- 経営データのダウンロード (アジェンダ③: JSON保存) ---
  const handleSaveGameData = () => {
    try {
      const saveData = {
        version: "mg_dx_v3",
        timestamp: new Date().toISOString(),
        players,
        turnOrder,
        orderIndex,
        commonPeriod,
        commonTurn,
        deck,
        markets,
        gameLogs
      };
      
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(saveData, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `mg_save_period_${commonPeriod}_turn_${commonTurn}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      playActionSound();
      addLog("💾 経営セーブデータ（JSON）のダウンロードを出力しました。");
    } catch (e) {
      console.error("Save failed", e);
      alert("❌ セーブデータの書き出しに失敗しました。");
    }
  };

  // --- 4社決算サマリーのCSVエクスポート ---
  const handleExportSummaryCsv = () => {
    try {
      const headers = [
        "プレイヤー名",
        "期",
        "自己資本",
        "現預金",
        "売上高(PQ)",
        "限界利益(MQ)",
        "固定費(F)",
        "経常利益(G)",
        "社員数",
        "機械台数(大)",
        "機械台数(小)",
        "技術レベル",
        "広告レベル"
      ];
      
      const rows = players.map(p => {
        const pPeriod = p.currentPeriod;
        const periodData = p.periods[pPeriod];
        const res = calculateFinancials(periodData.carryover, periodData.ledger, periodData.actuals);
        
        return [
          p.name,
          pPeriod,
          res.bs.totalNetAssets,
          res.bookEndingCash,
          res.pl.pq,
          res.pl.mq,
          res.pl.f,
          res.pl.g,
          res.workers,
          res.machines.large,
          res.machines.small,
          p.rdLevel || 0,
          p.adLevel || 0
        ];
      });
      
      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `mg_4player_summary_period_${commonPeriod}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      playActionSound();
      addLog("📊 4社決算サマリー（CSV）を保存しました。スプレッドシートへ転記可能です！");
    } catch (e) {
      console.error("Summary CSV Export failed", e);
      alert("❌ 決算サマリーCSVの出力に失敗しました。");
    }
  };

  // --- 自社仕訳出納帳のCSVエクスポート ---
  const handleExportLedgerCsv = () => {
    try {
      const myData = players[0].periods[players[0].currentPeriod];
      const myRes = calculateFinancials(myData.carryover, myData.ledger, myData.actuals);
      
      const headers = [
        "取引No",
        "仕訳記号",
        "取引内容(勘定科目)",
        "数量",
        "単価",
        "出金額",
        "入金額",
        "現金残高",
        "摘要(メモ)"
      ];
      
      let runningCash = myRes.bs.cash; // 期首現金残高
      const rows = (myData.ledger || []).map((entry, idx) => {
        // 出金額と入金額を判定
        let payment = 0;
        let receipt = 0;
        const amount = entry.amount || 0;
        
        if (entry.type === "payment" || entry.memo.includes("支払") || entry.memo.includes("仕入") || entry.memo.includes("出金") || entry.memo.includes("購入")) {
          payment = amount;
          runningCash -= amount;
        } else if (entry.type === "receipt" || entry.memo.includes("売上") || entry.memo.includes("入金") || entry.memo.includes("借入") || entry.memo.includes("販売") || entry.memo.includes("落札")) {
          receipt = amount;
          runningCash += amount;
        } else {
          // 不明な場合は摘要内容や金額で補正
          if (amount > 0) {
            if (entry.memo.includes("出納") || entry.memo.includes("記帳")) {
              receipt = amount;
              runningCash += amount;
            } else {
              payment = amount;
              runningCash -= amount;
            }
          }
        }
        
        return [
          idx + 1,
          entry.category || "-",
          entry.account || entry.memo.split(" ")[0] || "取引",
          entry.quantity || 0,
          entry.price || 0,
          payment,
          receipt,
          runningCash,
          entry.memo || ""
        ];
      });
      
      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `mg_my_ledger_period_${commonPeriod}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      playActionSound();
      addLog("✏️ 自社仕訳出納帳（CSV）を保存しました。スプレッドシートの帳簿へインポート可能です！");
    } catch (e) {
      console.error("Ledger CSV Export failed", e);
      alert("❌ 出納帳CSVの出力に失敗しました。");
    }
  };

  // --- 経営データのアップロード (アジェンダ③: JSON読込) ---
  const handleLoadGameData = (event) => {
    const fileReader = new FileReader();
    const file = event.target.files[0];
    if (!file) return;
    
    fileReader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.version === "mg_dx_v3" && Array.isArray(parsed.players)) {
          setPlayers(parsed.players);
          setTurnOrder(parsed.turnOrder);
          setOrderIndex(parsed.orderIndex);
          setCommonPeriod(parsed.commonPeriod);
          setCommonTurn(parsed.commonTurn);
          setDeck(parsed.deck);
          setMarkets(parsed.markets);
          setGameLogs(parsed.gameLogs);
          
          setCurrentCard(null);
          setActiveRiskEvent(null);
          setPhase('draw');
          
          playFanfareSound();
          addLog("📥 経営セーブデータ（JSON）が完全に復元されました！ゲームを再開します。");
          alert("🎉 経営データの読み込みに成功しました！");
        } else {
          alert("❌ 無効なセーブデータ形式です。バージョンまたはフォーマットが一致しません。");
        }
      } catch (err) {
        alert("❌ JSONファイルの解析に失敗しました。ファイルが破損している可能性があります。");
      }
    };
    fileReader.readAsText(file);
  };

  // --- ドロー処理 (効果音追加) ---
  const handleDrawCard = () => {
    if (phase !== 'draw') return;
    
    if (deck.length === 0) {
      addLog("🎴 山札がなくなったため、再シャッフルしました。");
      setDeck(generateShuffledDeck());
      return;
    }

    const nextDeck = [...deck];
    const card = nextDeck.pop();
    setDeck(nextDeck);
    
    setCurrentCard(card);
    setPhase('action');
    setActiveRiskEvent(null);

    if (card.category === CARD_CATEGORIES.RISK) {
      playRiskWarningSound(); // 🚨 リスク警告音
      addLog(`🚨 ${activePlayer.name} は [リスクカード] をドロー！(コマンドを実行して、具体的なリスクイベントを引いてください)`);
    } else {
      playDrawSound(); // 🎴 ドロー音
      addLog(`🧠 ${activePlayer.name} は [意思決定カード (Decision)] をドローしました！自由なアクションを選択できます。`);
    }
  };

  // コマンドを実行して、リスクの内容をドローする（多段階ドロー！）
  const handleDrawRiskEvent = () => {
    if (phase !== 'action' || !currentCard || currentCard.category !== CARD_CATEGORIES.RISK) return;

    const riskEvent = drawRandomRiskEvent();
    setActiveRiskEvent(riskEvent);
    playRiskConfirmSound(); // 💥 開封の災害確定音！
    addLog(`🎲 リスクカードを開封 ➔ 💥【${riskEvent.title}】が確定しました！`);
  };

  // アクション適用処理 (効果音適用)
  const handleExecuteAction = (type, payload) => {
    let actionLogText = "";
    let isRiskAction = type.startsWith("risk_");

    setPlayers(prev => prev.map((p, idx) => {
      const isTarget = idx === activePlayerIdx;
      const isAuctionWinner = type === "sale_auction" && idx === payload.winnerIdx;

      if (!isTarget && !isAuctionWinner) return p;

      const pPeriod = p.currentPeriod;
      const periodData = p.periods[pPeriod];
      const prevLedger = periodData.ledger || [];
      const newLedger = [...prevLedger];
      
      const prevCarryover = periodData.carryover;
      const newCarryover = { ...prevCarryover };
      
      const prevActuals = periodData.actuals;
      const newActuals = { ...prevActuals };

      const generateId = () => (Date.now() + Math.random()).toString();

      switch (type) {
        
        case "purchase":
          if (isTarget) {
            const purchases = payload.purchases || {};
            let totalQty = 0;
            let totalAmount = 0;
            let detailTexts = [];

            Object.entries(purchases).forEach(([marketId, qty]) => {
              if (qty <= 0) return;
              
              const mInfo = INITIAL_MARKETS[marketId];
              const freight = (mInfo.baseFreight || 0) * qty; // 送料
              const itemCost = qty * payload.price; // 材料費 (1万円/個)
              
              totalQty += qty;
              totalAmount += (itemCost + freight);
              
              newLedger.push({
                id: generateId(),
                category: "ツ",
                amount: itemCost,
                quantity: qty,
                memo: `材料仕入（単価:${payload.price}万 / ${mInfo.name}）`
              });

              if (freight > 0) {
                newLedger.push({
                  id: generateId(),
                  category: "セ",
                  amount: freight,
                  quantity: 0,
                  memo: `${mInfo.name}からの仕入運賃`
                });
                detailTexts.push(`${mInfo.name}から${qty}個(送料¥${freight}万)`);
              } else {
                detailTexts.push(`${mInfo.name}から${qty}個`);
              }

              // 全国の市場残高を減らす
              setMarkets(prevMarkets => {
                const updated = { ...prevMarkets };
                updated[marketId] = {
                  ...updated[marketId],
                  materials: Math.max(0, updated[marketId].materials - qty)
                };
                return updated;
              });
            });

            actionLogText = `📥 [仕入] ${p.name} が材料を計 ${totalQty} 個仕入れました (${detailTexts.join("、")} / 総計 ¥${totalAmount}万支出)`;
          }
          break;

        case "produce":
          if (isTarget) {
            // 生産能力の算出 (ワーカー、大型、小型、アタッチ、PAC緑チップ連動)
            const currentLarge = newCarryover.largeMachines || 0;
            const currentSmall = newCarryover.smallMachines || 0;
            const currentAttach = newCarryover.attachments || 0;
            
            // 現在のワーカー数を算出
            let currentProdWorkers = newCarryover.workersProd !== undefined ? newCarryover.workersProd : 2;
            newLedger.forEach(entry => {
              if (entry.category === 'ソ' && entry.memo?.includes('新規採用（ワーカー）')) {
                currentProdWorkers += (Number(entry.quantity) || 0);
              }
              // 配置転換での移動
              if (entry.category === 'ソ' && entry.memo?.includes('配置転換（ワーカーに移動）')) {
                currentProdWorkers += (Number(entry.quantity) || 0);
              }
              if (entry.category === 'ソ' && entry.memo?.includes('配置転換（セールスマンに移動）')) {
                currentProdWorkers -= (Number(entry.quantity) || 0);
              }
            });
            
            let activeLarge = Math.min(currentLarge, currentProdWorkers);
            let activeSmall = Math.min(currentSmall, Math.max(0, currentProdWorkers - activeLarge));
            
            // 小型機械にアタッチメントを割り当て (小型機械1台につきアタッチは最大1つ有効)
            const activeAttach = Math.min(currentAttach, activeSmall);
            
            // 基本生産能力: 大型は1台につき4個、小型は1台につき1個、アタッチは+1個
            const baseCap = (activeLarge * 4) + (activeSmall * 1) + activeAttach;
            
            // PAC生産性 (緑チップ) のブースト: 稼働している機械1台につき+1個
            const pacBoost = p.hasPac ? (activeLarge + activeSmall) : 0;
            const activeCapacity = baseCap + pacBoost;
            
            const finalProduceQty = Math.min(payload.qty, activeCapacity); // 生産能力上限で切り詰め
            
            if (payload.type === 'input') {
              const totalInputCost = finalProduceQty * 2; // 投入は 1個につき2万円 (コ)
              newLedger.push({
                id: generateId(),
                category: "コ",
                amount: totalInputCost,
                quantity: finalProduceQty,
                memo: `材料投入 (単価:2万)`
              });
              actionLogText = `⚙️ [投入] ${p.name} が材料 ${finalProduceQty} 個を工場ラインへ投入しました (投入費: ¥${totalInputCost}万、最大生産能力: ${activeCapacity}個)`;
            } else {
              const totalProcessingCost = finalProduceQty * 1; // 完成は 1個につき1万円 (サ)
              newLedger.push({
                id: generateId(),
                category: "サ",
                amount: totalProcessingCost,
                quantity: finalProduceQty,
                memo: `製品完成加工費 (単価:1万)`
              });
              actionLogText = `🏭 [完成] ${p.name} が製品を ${finalProduceQty} 個完成させました (完成加工費: ¥${totalProcessingCost}万、最大生産能力: ${activeCapacity}個)`;
            }
          }
          break;

        case "sale_direct":
          if (isTarget) {
            const marketInfo = INITIAL_MARKETS[payload.marketId];
            newLedger.push({
              id: generateId(),
              category: "キ",
              amount: payload.qty * payload.price,
              quantity: payload.qty,
              memo: `直接販売（単価:${payload.price}万 / ${marketInfo.name}）`
            });

            if (marketInfo.baseFreight > 0) {
              const totalFreight = marketInfo.baseFreight * payload.qty;
              newLedger.push({
                id: generateId(),
                category: "セ",
                amount: totalFreight,
                quantity: 0,
                memo: `${marketInfo.name}への販売運賃`
              });
              actionLogText = `💰 [直接販売] ${p.name} が ${marketInfo.name} に製品 ${payload.qty} 個を販売！(単価: ¥${payload.price}万, 運賃 ¥${totalFreight}万がセに自動計上)`;
            } else {
              actionLogText = `💰 [直接販売] ${p.name} が ${marketInfo.name} に製品 ${payload.qty} 個を販売しました (単価: ¥${payload.price}万)`;
            }

            setMarkets(prevMarkets => {
              const updated = { ...prevMarkets };
              const history = updated[payload.marketId].salesHistory || [];
              updated[payload.marketId] = {
                ...updated[payload.marketId],
                salesHistory: [{ player: p.name, price: payload.price, qty: payload.qty, turn: commonTurn }, ...history].slice(0, 10)
              };
              return updated;
            });
          }
          break;

        case "sale_auction":
          if (isAuctionWinner) {
            const marketInfo = INITIAL_MARKETS[payload.marketId];
            newLedger.push({
              id: generateId(),
              category: "ネ",
              amount: payload.qty * payload.price,
              quantity: payload.qty,
              memo: `入札落札（単価:${payload.price}万 / ${marketInfo.name}）`
            });

            if (marketInfo.baseFreight > 0) {
              const totalFreight = marketInfo.baseFreight * payload.qty;
              newLedger.push({
                id: generateId(),
                category: "セ",
                amount: totalFreight,
                quantity: 0,
                memo: `${marketInfo.name}への落札運賃`
              });
              actionLogText = `⚔️ [オークション落札] ${p.name} が ${marketInfo.name} で製品を落札！(単価: ¥${payload.price}万, 運賃 ¥${totalFreight}万が自動計上)`;
            } else {
              actionLogText = `⚔️ [オークション落札] ${p.name} が ${marketInfo.name} で単価 ¥${payload.price}万 で落札しました！`;
            }

            setMarkets(prevMarkets => {
              const updated = { ...prevMarkets };
              const history = updated[payload.marketId].salesHistory || [];
              updated[payload.marketId] = {
                ...updated[payload.marketId],
                salesHistory: [{ player: p.name, price: payload.price, qty: payload.qty, turn: commonTurn }, ...history].slice(0, 10)
              };
              return updated;
            });
            alert(`🎉 ${p.name} が ${marketInfo.name} にて製品を落札しました！(単価: ¥${payload.price}万)`);
          }
          break;

        case "buy_machine":
          if (isTarget) {
            if (payload.type === 'bulk') {
              const largeQty = Number(payload.machines?.large) || 0;
              const smallQty = Number(payload.machines?.small) || 0;
              const attachQty = Number(payload.machines?.attachment) || 0;

              const largePrice = 200; // 大型機械 200万
              const smallPrice = 100; // 小型機械 100万
              const attachPrice = 20; // アタッチメント 20万

              const totalCost = (largeQty * largePrice) + (smallQty * smallPrice) + (attachQty * attachPrice);

              newCarryover.largeMachines = (newCarryover.largeMachines || 0) + largeQty;
              newCarryover.smallMachines = (newCarryover.smallMachines || 0) + smallQty;
              newCarryover.attachments = (newCarryover.attachments || 0) + attachQty;
              
              newCarryover.machinesCount = (newCarryover.largeMachines || 0) + (newCarryover.smallMachines || 0);
              newCarryover.machinesValue = (newCarryover.machinesValue || 0) + totalCost;

              if (largeQty > 0) {
                newLedger.push({
                  id: generateId(),
                  category: "ケ",
                  amount: largeQty * largePrice,
                  quantity: largeQty,
                  memo: `大型機械 ${largeQty}台購入`
                });
              }
              if (smallQty > 0) {
                newLedger.push({
                  id: generateId(),
                  category: "ケ",
                  amount: smallQty * smallPrice,
                  quantity: smallQty,
                  memo: `小型機械 ${smallQty}台購入`
                });
              }
              if (attachQty > 0) {
                newLedger.push({
                  id: generateId(),
                  category: "ケ",
                  amount: attachQty * attachPrice,
                  quantity: attachQty,
                  memo: `アタッチメント ${attachQty}台購入`
                });
              }

              let detailTexts = [];
              if (largeQty > 0) detailTexts.push(`大型:${largeQty}台`);
              if (smallQty > 0) detailTexts.push(`小型:${smallQty}台`);
              if (attachQty > 0) detailTexts.push(`アタッチ:${attachQty}台`);

              actionLogText = `🏗️ [設備投資] ${p.name} が機械設備を一括購入しました (${detailTexts.join(', ')}、合計購入額 ¥${totalCost}万)。`;
            } else {
              let price = 0;
              let label = "";
              if (payload.type === 'small') {
                price = 100;
                label = "小型機械";
                newCarryover.smallMachines = (newCarryover.smallMachines || 0) + 1;
              } else if (payload.type === 'large') {
                price = 200;
                label = "大型機械";
                newCarryover.largeMachines = (newCarryover.largeMachines || 0) + 1;
              } else if (payload.type === 'attachment') {
                price = 20;
                label = "アタッチメント";
                newCarryover.attachments = (newCarryover.attachments || 0) + 1;
              }
              newCarryover.machinesCount = (newCarryover.largeMachines || 0) + (newCarryover.smallMachines || 0);
              newCarryover.machinesValue = (newCarryover.machinesValue || 0) + price;

              newLedger.push({
                id: generateId(),
                category: "ケ",
                amount: price,
                quantity: 1,
                memo: `${label}購入`
              });
              actionLogText = `🏗️ [機械購入] ${p.name} が ${label} を ¥${price}万 で購入しました。`;
            }
          }
          break;

        case "hire":
          if (isTarget) {
            const currentProd = newCarryover.workersProd !== undefined ? newCarryover.workersProd : 0;
            const currentSales = newCarryover.workersSales !== undefined ? newCarryover.workersSales : 0;

            if (payload.type === 'bulk') {
              const prodQty = Number(payload.hire?.prod) || 0;
              const salesQty = Number(payload.hire?.sales) || 0;
              const hireCostPerPerson = 30; // 戦略MG公式ルール: 新規採用費は30万

              const totalHireCost = (prodQty + salesQty) * hireCostPerPerson;

              newCarryover.workersProd = currentProd + prodQty;
              newCarryover.workersSales = currentSales + salesQty;
              newCarryover.workers = newCarryover.workersProd + newCarryover.workersSales;

              if (totalHireCost > 0) {
                newLedger.push({
                  id: generateId(),
                  category: "ソ",
                  amount: totalHireCost,
                  quantity: prodQty + salesQty,
                  memo: `新規採用（ワーカー:${prodQty}名 / セールスマン:${salesQty}名）`
                });
              }

              let detailTexts = [];
              if (prodQty > 0) detailTexts.push(`ワーカー:${prodQty}名`);
              if (salesQty > 0) detailTexts.push(`セールスマン:${salesQty}名`);

              actionLogText = `👤 [雇用] ${p.name} が社員を新規採用しました (${detailTexts.join(', ')}、合計採用費 ¥${totalHireCost}万は「ソ」に計上)。`;
            } else {
              const isProd = payload.type === 'prod';
              if (isProd) {
                newCarryover.workersProd = currentProd + 1;
              } else {
                newCarryover.workersSales = currentSales + 1;
              }
              newCarryover.workers = newCarryover.workersProd + newCarryover.workersSales;

              newLedger.push({
                id: generateId(),
                category: "ソ",
                amount: 30, // 採用時の一人当たり費用: 30万円
                quantity: 1,
                memo: `新規採用（${isProd ? 'ワーカー' : 'セールスマン'}）`
              });
              actionLogText = `👤 [雇用] ${p.name} が ${isProd ? '⚙️ワーカー' : '💼セールスマン'} を新規採用しました。(採用費¥30万は「ソ」に計上)。`;
            }
          }
          break;

        case "loan":
          if (isTarget) {
            const pPeriod = p.currentPeriod || 1;
            // 2〜3期目は10%、4期目以降は5%
            const interestRate = pPeriod <= 3 ? 0.10 : 0.05;
            const interestAmount = Math.round(payload.amount * interestRate); // 金利(万円)
            
            // 1. 借入金 (オ) 入金
            newLedger.push({
              id: generateId(),
              category: "オ",
              amount: payload.amount,
              quantity: 0,
              memo: `資金調達（借入）`
            });
            
            // 2. 金利 (タ) 即時支払
            if (interestAmount > 0) {
              newLedger.push({
                id: generateId(),
                category: "タ",
                amount: interestAmount,
                quantity: 0,
                memo: `借入金利支払 (期:${pPeriod} / 率:${interestRate * 100}%)`
              });
            }
            
            actionLogText = `🏦 [借入金] ${p.name} が銀行から ¥${payload.amount}万 を借入しました。(金利 ¥${interestAmount}万 が自動発生し「タ」に即時計上されました)`;
          }
          break;

        case "buy_chip":
          if (isTarget) {
            const selectedChips = payload.chipTypes || (payload.chipType ? [payload.chipType] : []);
            if (selectedChips.length > 0) {
              let detailTexts = [];
              selectedChips.forEach(chipType => {
                let price = 0;
                let category = "ソ";
                let label = "";
                
                if (chipType === 'insurance') {
                  price = 5;
                  category = "ソ"; // 保険: 一般管理費
                  label = "保険 (黄チップ)";
                  p.hasInsurance = true;
                } else if (chipType === 'pac') {
                  price = 10;
                  category = "ス"; // PAC生産性: 製造経費
                  label = "PAC生産性 (緑チップ)";
                  p.hasPac = true;
                } else if (chipType === 'merchandiser') {
                  price = 10;
                  category = "ソ"; // マーチャンダイザー: 一般管理費
                  label = "マーチャンダイザー (緑チップ)";
                  p.hasMerchandiser = true;
                } else if (chipType === 'research') {
                  price = 10;
                  category = "セ"; // マーケットリサーチ: 販売費
                  label = "マーケットリサーチ (緑チップ)";
                  p.hasResearch = true;
                }
                
                newLedger.push({
                  id: generateId(),
                  category: category,
                  amount: price,
                  quantity: 1,
                  memo: `${label}購入`
                });
                detailTexts.push(`${label} (¥${price}万/「${category}」)`);
              });
              
              actionLogText = `🟡 [チップ購入] ${p.name} が【${detailTexts.join('、')}】を一斉購入しました。`;
            }
          }
          break;

        case "transfer_worker":
          if (isTarget) {
            const toType = payload.type; // 'prod' または 'sales'
            const currentProd = newCarryover.workersProd !== undefined ? newCarryover.workersProd : 0;
            const currentSales = newCarryover.workersSales !== undefined ? newCarryover.workersSales : 0;
            
            if (toType === 'prod' && currentSales > 0) {
              newCarryover.workersProd = currentProd + 1;
              newCarryover.workersSales = currentSales - 1;
            } else if (toType === 'sales' && currentProd > 0) {
              newCarryover.workersProd = currentProd - 1;
              newCarryover.workersSales = currentSales + 1;
            }
            
            newLedger.push({
              id: generateId(),
              category: "ソ",
              amount: 5, // 配置転換費 5万円
              quantity: 1,
              memo: `配置転換（${toType === 'prod' ? 'ワーカーに移動' : 'セールスマンに移動'}）`
            });
            
            actionLogText = `🔄 [配置転換] ${p.name} が ¥5万（研修費）を支払い、社員の職種を配置転換しました。(ワーカー:${newCarryover.workersProd}人 / セールスマン:${newCarryover.workersSales}人)`;
          }
          break;

        case "sell_machine":
          if (isTarget) {
            const mType = payload.machineType;
            let refund = 0;
            let label = "";
            let originalPrice = 0;
            
            if (mType === 'small' && (newCarryover.smallMachines || 0) > 0) {
              refund = 50;
              originalPrice = 100;
              label = "小型機械";
              newCarryover.smallMachines = newCarryover.smallMachines - 1;
            } else if (mType === 'large' && (newCarryover.largeMachines || 0) > 0) {
              refund = 100;
              originalPrice = 200;
              label = "大型機械";
              newCarryover.largeMachines = newCarryover.largeMachines - 1;
            } else if (mType === 'attachment' && (newCarryover.attachments || 0) > 0) {
              refund = 10;
              originalPrice = 20;
              label = "アタッチメント";
              newCarryover.attachments = newCarryover.attachments - 1;
            }
            
            newCarryover.machinesCount = (newCarryover.largeMachines || 0) + (newCarryover.smallMachines || 0);
            newCarryover.machinesValue = Math.max(0, (newCarryover.machinesValue || 0) - originalPrice); // 元の購入価格（簿価）を減算する
            
            newLedger.push({
              id: generateId(),
              category: "イ",
              amount: refund,
              quantity: 1,
              memo: `${label}売却`
            });
            
            actionLogText = `💸 [機械売却] ${p.name} が ${label} を売却し、半額の ¥${refund}万 を回収しました。(「イ」に計上)`;
          }
          break;

        case "repay":
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "ナ",
              amount: payload.amount,
              quantity: 0,
              memo: `借入金返済`
            });
            actionLogText = `🏦 [借入返済] ${p.name} が銀行に借入金 ¥${payload.amount}万 を返済しました。`;
          }
          break;

        case "rd":
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "チ",
              amount: 20,
              quantity: 0,
              memo: `研究開発投資`
            });
            p.rdLevel = (p.rdLevel || 0) + 1;
            actionLogText = `🔬 [研究開発] ${p.name} が開発費 ¥20万 を投資し、研究レベルが L${p.rdLevel} になりました！`;
          }
          break;

        case "ad":
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "セ",
              amount: 10,
              quantity: 0,
              memo: `広告宣伝出金`
            });
            p.adLevel = (p.adLevel || 0) + 1;
            actionLogText = `📢 [広告宣伝] ${p.name} が ¥10万 を投じ、広告レベルが L${p.adLevel} になりました。`;
          }
          break;

        case "risk_fire":
          if (isTarget) {
            newActuals.fireCount = (newActuals.fireCount || 0) + 2;
            let insuranceText = "";
            if (p.hasInsurance) {
              const insurancePayout = 8 * 2; // 火災時に8万/個 × 2個 = 16万
              newLedger.push({
                id: generateId(),
                category: "エ",
                amount: insurancePayout,
                quantity: 0,
                memo: `火災保険金受取 (8万×2)`
              });
              p.hasInsurance = false; // 保険チップは返却
              insuranceText = `（🛡️保険チップ適用により受取保険金「エ」¥${insurancePayout}万が自動計上され、チップは回収されました）`;
            }
            actionLogText = `🔥 [火災災害] ${p.name} で火災が発生し、材料 2個 が焼失しました！${insuranceText}`;
          }
          break;

        case "risk_miss":
          if (isTarget) {
            newActuals.missCount = (newActuals.missCount || 0) + 1;
            actionLogText = `💥 [製造不良] ${p.name} で製造不良が発生し、仕掛品 1個 がスクラップ化されました。`;
          }
          break;

        case "risk_theft":
          if (isTarget) {
            newActuals.theftCount = (newActuals.theftCount || 0) + 1;
            let insuranceText = "";
            if (p.hasInsurance) {
              const insurancePayout = 10 * 1; // 盗難時に10万/個 × 1個 = 10万
              newLedger.push({
                id: generateId(),
                category: "エ",
                amount: insurancePayout,
                quantity: 0,
                memo: `盗難保険金受取 (10万×1)`
              });
              p.hasInsurance = false; // 保険チップは返却
              insuranceText = `（🛡️保険チップ適用により受取保険金「エ」¥${insurancePayout}万が自動計上され、チップは回収されました）`;
            }
            actionLogText = `🕵️ [製品盗難] ${p.name} で盗難が発生し、完成品製品 1個 が紛失しました！${insuranceText}`;
          }
          break;

        case "risk_tax":
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "ソ",
              amount: 10,
              quantity: 0,
              memo: "税務監査の修正出金"
            });
            actionLogText = `💸 [税務監査] ${p.name} に税務監査が入り、修正出金 ¥10万 が一般管理費（ソ）に計上されました。`;
          }
          break;

        case "risk_repair":
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "ス",
              amount: 10,
              quantity: 0,
              memo: "機械工具緊急修理費"
            });
            actionLogText = `🛠️ [機械故障] ${p.name} の所有機械が故障！緊急修理費 ¥10万 が製造固定費（ス）に計上されました。`;
          }
          break;

        default:
          break;
      }

      // 統計（stats）の更新と累積
      const updatedStats = { ...p.stats };
      if (!isRiskAction && type !== "draw") {
        if (isTarget) {
          const elapsed = Date.now() - turnStartTime;
          updatedStats.totalDecisionTime = (updatedStats.totalDecisionTime || 0) + elapsed;
          updatedStats.decisionCount = (updatedStats.decisionCount || 0) + 1;
        }
      }

      // 1回の最大販売個数
      if (type === "sale_direct" && isTarget) {
        updatedStats.maxSingleSaleQty = Math.max(updatedStats.maxSingleSaleQty || 0, payload.qty || 0);
      }
      if (type === "sale_auction" && isAuctionWinner) {
        updatedStats.maxSingleSaleQty = Math.max(updatedStats.maxSingleSaleQty || 0, payload.qty || 0);
      }

      // 最大チップ投資レベル
      updatedStats.maxAdLevel = Math.max(updatedStats.maxAdLevel || 0, p.adLevel || 0);
      updatedStats.maxRdLevel = Math.max(updatedStats.maxRdLevel || 0, p.rdLevel || 0);

      // 手番の開始時点で在庫が枯渇（デッドロック）していないかの追跡
      if (isTarget && type !== "draw" && !isRiskAction) {
        const matCount = newCarryover.materials || 0;
        const wipCount = newCarryover.wip || 0;
        const prodCount = newCarryover.products || 0;
        if (matCount === 0 && wipCount === 0 && prodCount === 0) {
          updatedStats.stockoutCount = (updatedStats.stockoutCount || 0) + 1;
        }
      }

      return {
        ...p,
        stats: updatedStats,
        periods: {
          ...p.periods,
          [pPeriod]: {
            ...periodData,
            ledger: newLedger,
            carryover: newCarryover,
            actuals: newActuals
          }
        }
      };
    }));

    // 効果音再生
    if (isRiskAction) {
      playRiskConfirmSound();
    } else if (type === "sale_auction") {
      playFanfareSound();
    } else {
      playActionSound();
    }

    if (actionLogText) {
      addLog(actionLogText);
    }
    // もしルールBフェーズ中なら、フェーズを移行せずルールBを維持する
    if (phase !== 'ruleB') {
      setPhase('resolved');
    }
  };

  const handleNpcTurnPlay = () => {
    const npcData = activePlayer.periods[activePlayer.currentPeriod];
    const npcRes = calculateFinancials(npcData.carryover, npcData.ledger, npcData.actuals);

    // --- AIのルールB（手番前アクション）フェーズ ---
    if (phase === 'ruleB') {
      if (!activePlayer.isNpc) return;

      // 新設した NPC ルールB 意思決定エンジンを呼び出す
      const decision = decideNpcRuleB(activePlayer, npcRes, activePlayer.difficulty);
      
      if (!decision || decision.type === "end") {
        // やるべきアクションがなければ、ルールBフェーズを終了し、カードドローへ移行！
        addLog(`📢 [手番前終了] ${activePlayer.name} は手番前（ルールB）アクションを終了しました。`);
        setPhase('draw');
      } else {
        // 意思決定に基づくアクションを実行する
        let finalType = decision.type;
        let finalPayload = decision.payload;
        
        handleExecuteAction(finalType, finalPayload);
        
        // 実行後、NPCは「ruleB」フェーズを維持します。
        // これにより、手番進行をクリックするたびにAIは連続してルールBを評価・実行できます。
        // AIが「やることがない（end）」と判断した時点で、自律的に draw フェーズに移行します。
      }
      return;
    }

    if (!activePlayer.isNpc || phase !== 'action') return;

    if (currentCard.category === CARD_CATEGORIES.RISK) {
      if (!activeRiskEvent) {
        const riskEvent = drawRandomRiskEvent();
        setActiveRiskEvent(riskEvent);
        playRiskConfirmSound(); // AIもリスク決定音
        addLog(`🎲 AIライバル ${activePlayer.name} がリスクカードを開封 ➔ 💥【${riskEvent.title}】`);
        return;
      }
      handleExecuteAction(activeRiskEvent.actionType, {});
      return;
    }

    const npcResults = calculateFinancials(currentData.carryover, currentData.ledger, currentData.actuals);
    const marketList = Object.values(markets);
    const availableMarket = marketList.find(m => m.materials > 0) || marketList[2];
    
    // 現在NPCが引いたカードは「意思決定（ワイルドカード）」です！
    // したがって、NPCが現在の在庫・能力・現預金状況に基づいて、最も必要としているカードアクションをインテリジェントに選択させます。
    let bestCardType = "pass";
    if (npcResults.prod.endingCount > 0) {
      bestCardType = "sale_direct";
    } else if (npcResults.wip.endingCount > 0 && npcResults.bookEndingCash >= 5) {
      bestCardType = "produce"; // 製造（完成）
    } else if (npcResults.mat.endingCount > 0 && npcResults.bookEndingCash >= 10) {
      bestCardType = "produce"; // 製造（投入）
    } else if (availableMarket.materials > 0 && npcResults.bookEndingCash >= 30) {
      bestCardType = "purchase"; // 材料仕入
    } else if (npcResults.bookEndingCash >= 150 && (npcResults.machines.large + npcResults.machines.small) < 3) {
      bestCardType = "buy_machine"; // 機械購入
    } else if (npcResults.bookEndingCash >= 80 && (npcResults.machines.large + npcResults.machines.small) > npcResults.workers) {
      bestCardType = "hire"; // 社員採用
    } else if (npcResults.bookEndingCash >= 40) {
      bestCardType = Math.random() < 0.5 ? "rd" : "ad"; // 研究開発または広告
    }
    
    const decisionCardSim = { type: bestCardType };
    const decision = decideNpcAction(activePlayer, npcResults, decisionCardSim, activePlayer.difficulty, availableMarket.materials);
    
    let finalType = decision.type;
    let finalPayload = decision.payload;

    if (decision.type === "purchase") {
      finalPayload.marketId = availableMarket.id;
    } else if (decision.type === "sale_direct") {
      finalPayload.marketId = "tokyo";
    }

    if (decision.type === "pass") {
      if (npcResults.bookEndingCash >= 100) {
        finalType = "rd";
        finalPayload = {};
      } else {
        addLog(`💤 [パス] ${activePlayer.name} は何もしない（パス）を選択しました。`);
        playActionSound();
        setPhase('resolved');
        return;
      }
    }

    handleExecuteAction(finalType, finalPayload);
  };

  // AI対戦オークション (効果音連携)
  const handleRunAuctionWithNpcs = (yourBidPrice, qty, marketId) => {
    const bids = {};
    
    players.forEach((p, idx) => {
      if (p.isNpc) {
        const npcData = p.periods[p.currentPeriod];
        const npcRes = calculateFinancials(npcData.carryover, npcData.ledger, npcData.actuals);
        const bid = decideNpcBid(p, npcRes, p.difficulty);
        bids[idx] = bid;
      } else {
        bids[idx] = yourBidPrice;
      }
    });

    const parentIdx = turnOrder[orderIndex]; // 親 (現在の手番プレイヤーのインデックス)
    const limitPrice = INITIAL_MARKETS[marketId].limitPrice; // 各市場の上限価格

    // 各プレイヤーの実質的な競争価格（評価値。安い方が勝ち！）を計算
    const evalPrices = {};
    players.forEach((p, idx) => {
      const baseBid = bids[idx] || 999;
      // 親は -2、研究開発チップ(青)1枚につき -2 の補正
      const isParent = idx === parentIdx;
      const rdCount = p.rdLevel || 0;
      evalPrices[idx] = baseBid - (isParent ? 2 : 0) - (rdCount * 2);
    });

    // 落札者の選定 (評価値が低い順、同評価の場合は優先順位判定)
    let winnerIdx = -1;
    let lowestEval = 999;

    players.forEach((p, idx) => {
      const evalPrice = evalPrices[idx];
      const isWinnerEmpty = winnerIdx === -1;
      
      if (isWinnerEmpty) {
        lowestEval = evalPrice;
        winnerIdx = idx;
        return;
      }

      // 競争価格が安い（値ごろ感がある）方が優先落札
      if (evalPrice < lowestEval) {
        lowestEval = evalPrice;
        winnerIdx = idx;
      } 
      // 評価額が同点（同金額）の場合の優先順位チェック
      else if (evalPrice === lowestEval) {
        const currentWinnerRd = players[winnerIdx].rdLevel || 0;
        const thisRd = p.rdLevel || 0;
        
        // 1. 研究開発（青）の所持枚数が多い方が優先
        if (thisRd > currentWinnerRd) {
          winnerIdx = idx;
        } else if (thisRd === currentWinnerRd) {
          // 2. 所持数も同じなら、親が優先
          if (idx === parentIdx) {
            winnerIdx = idx;
          }
          // 3. 親でもなく、条件が完全同一ならサイコロ（ランダムで50%）
          else if (winnerIdx !== parentIdx && Math.random() < 0.5) {
            winnerIdx = idx;
          }
        }
      }
    });

    const marketName = INITIAL_MARKETS[marketId].name;
    const bidInfo = players.map(p => {
      const isParent = p.id === parentIdx;
      const rdCount = p.rdLevel || 0;
      const displayBid = bids[p.id];
      const evalText = ` (実質評価: ¥${evalPrices[p.id]}万${isParent ? ' / 親特典-2万' : ''}${rdCount > 0 ? ` / 青チップ枚数:${rdCount}` : ''})`;
      return `${p.name}: ¥${displayBid}万${evalText}`;
    }).join(", ");
    
    addLog(`⚔️ [${marketName}入札結果] 一覧: ${bidInfo}`);

    // 落札単価は提示した金額。ただし、マーケットリサーチ（緑チップ）を持っているなら単価+2万円（上限を超えない）
    let finalPrice = bids[winnerIdx];
    let researchText = "";
    if (players[winnerIdx].hasResearch) {
      const oldPrice = finalPrice;
      finalPrice = Math.min(limitPrice, finalPrice + 2);
      if (finalPrice > oldPrice) {
        researchText = `（🟢マーケットリサーチ適用により単価+${finalPrice - oldPrice}万ブーストされ、売上は ¥${finalPrice}万 となりました！）`;
      }
    }

    handleExecuteAction("sale_auction", { winnerIdx, price: finalPrice, qty, marketId });
    alert(`🎉 ${players[winnerIdx].name} が ${marketName} にて製品を落札しました！(落札単価: ¥${finalPrice}万)${researchText}`);
  };

  // 手番の終了 ➔ 次へ
  const handleEndTurn = () => {
    if (phase !== 'resolved') return;

    const nextOrderIndex = (orderIndex + 1) % 4;

    if (nextOrderIndex === 0) {
      if (commonTurn >= 30) {
        if (window.confirm("第30ターン（最終ターン）が終了しました。期末決算処理を行いますか？\n（期末自動労務費・製造経費・販売費・管理費・借入金利が自動的に帳簿へ追加されます）")) {
          
          // 全プレイヤーの帳簿へ「期末自動仕訳」を追加
          setPlayers(prev => prev.map(p => {
            const pPeriod = p.currentPeriod;
            const periodData = p.periods[pPeriod];
            if (!periodData) return p;
            
            const carryover = periodData.carryover;
            const ledger = periodData.ledger || [];
            
            // 現在の合計借入金を算出
            let totalLoan = carryover.loan || 0;
            ledger.forEach(entry => {
              if (entry.category === 'オ') totalLoan += (Number(entry.amount) || 0); // 借入
              if (entry.category === 'ナ') totalLoan -= (Number(entry.amount) || 0); // 返済
            });
            
            // 現在の機械数（延べ台数：小型＋大型＋アタッチメント）を算出
            let currentLarge = carryover.largeMachines || 0;
            let currentSmall = carryover.smallMachines || 0;
            let currentAttach = carryover.attachments || 0;
            ledger.forEach(entry => {
              if (entry.category === 'ケ') {
                if (entry.memo?.includes('大型')) currentLarge += (Number(entry.quantity) || 0);
                if (entry.memo?.includes('小型')) currentSmall += (Number(entry.quantity) || 0);
                if (entry.memo?.includes('アタッチメント')) currentAttach += (Number(entry.quantity) || 0);
              }
              if (entry.category === 'イ') {
                if (entry.memo?.includes('大型')) currentLarge -= (Number(entry.quantity) || 0);
                if (entry.memo?.includes('小型')) currentSmall -= (Number(entry.quantity) || 0);
                if (entry.memo?.includes('アタッチメント')) currentAttach -= (Number(entry.quantity) || 0);
              }
            });
            const machineTotal = Math.max(0, currentLarge + currentSmall + currentAttach);

            // 現在のワーカー数とセールスマン数を算出
            let workersProdCount = carryover.workersProd !== undefined ? carryover.workersProd : 0;
            let workersSalesCount = carryover.workersSales !== undefined ? carryover.workersSales : 0;
            ledger.forEach(entry => {
              if (entry.category === 'ソ' && entry.memo?.includes('新規採用（ワーカー）')) {
                workersProdCount += (Number(entry.quantity) || 0);
              }
              if (entry.category === 'ソ' && entry.memo?.includes('新規採用（セールスマン）')) {
                workersSalesCount += (Number(entry.quantity) || 0);
              }
              if (entry.category === 'ソ' && entry.memo?.includes('配置転換（ワーカーに移動）')) {
                workersProdCount += (Number(entry.quantity) || 0);
                workersSalesCount -= (Number(entry.quantity) || 0);
              }
              if (entry.category === 'ソ' && entry.memo?.includes('配置転換（セールスマンに移動）')) {
                workersProdCount -= (Number(entry.quantity) || 0);
                workersSalesCount += (Number(entry.quantity) || 0);
              }
            });
            
            const updatedLedger = [...ledger];
            
            // すでに【期末自動】がある場合は重複追加しない
            const hasAutoSettlement = ledger.some(entry => entry.memo?.includes("【期末自動】"));
            
            if (!hasAutoSettlement) {
              // ジュニア・ルール期末費用単価表
              const JUNIOR_PERIOD_FEES = {
                1: { workers: 15, machines: 20, sales: 15, admin: 10 },
                2: { workers: 17, machines: 22, sales: 17, admin: 11 },
                3: { workers: 19, machines: 24, sales: 19, admin: 12 },
                4: { workers: 21, machines: 26, sales: 21, admin: 13 },
                5: { workers: 23, machines: 28, sales: 23, admin: 14 }
              };
              
              const fees = JUNIOR_PERIOD_FEES[pPeriod] || JUNIOR_PERIOD_FEES[5];
              
              // 1. 労務費 (シ) 期末自動計上
              const totalLaborCost = workersProdCount * fees.workers;
              if (totalLaborCost > 0) {
                updatedLedger.push({
                  id: `auto_labor_${Date.now()}_${Math.random()}`,
                  category: "シ",
                  amount: totalLaborCost,
                  quantity: workersProdCount,
                  memo: `【期末自動】労務費 (単価:${fees.workers}万 / ${workersProdCount}人)`
                });
              }

              // 2. 製造経費 (ス) 期末自動計上 (機械延べ台数に基づく固定経費)
              const totalMachineCost = machineTotal * fees.machines;
              if (totalMachineCost > 0) {
                updatedLedger.push({
                  id: `auto_machine_${Date.now()}_${Math.random()}`,
                  category: "ス",
                  amount: totalMachineCost,
                  quantity: machineTotal,
                  memo: `【期末自動】製造経費 (単価:${fees.machines}万 / 延べ機械:${machineTotal}台)`
                });
              }

              // 3. 販売費 (セ) 期末自動計上
              const totalSalesWorkerCost = workersSalesCount * fees.sales;
              if (totalSalesWorkerCost > 0) {
                updatedLedger.push({
                  id: `auto_sales_${Date.now()}_${Math.random()}`,
                  category: "セ",
                  amount: totalSalesWorkerCost,
                  quantity: workersSalesCount,
                  memo: `【期末自動】販売費人件費 (単価:${fees.sales}万 / ${workersSalesCount}人)`
                });
              }

              // 4. 一般管理費 (ソ) 期末自動計上 (期末合計社員数に基づく固定管理費)
              const totalWorkersTotal = workersProdCount + workersSalesCount;
              const totalAdminCost = totalWorkersTotal * fees.admin;
              if (totalAdminCost > 0) {
                updatedLedger.push({
                  id: `auto_admin_${Date.now()}_${Math.random()}`,
                  category: "ソ",
                  amount: totalAdminCost,
                  quantity: totalWorkersTotal,
                  memo: `【期末自動】一般管理費人件費 (単価:${fees.admin}万 / ${totalWorkersTotal}人)`
                });
              }

              // 5. 借入金に対する期末金利（タ）の自動計上
              if (totalLoan > 0 && pPeriod >= 2) {
                const interestRate = pPeriod <= 3 ? 0.10 : 0.05;
                const periodInterest = Math.round(totalLoan * interestRate);
                if (periodInterest > 0) {
                  updatedLedger.push({
                    id: `auto_loan_interest_${Date.now()}_${Math.random()}`,
                    category: "タ",
                    amount: periodInterest,
                    quantity: 0,
                    memo: `【期末自動】借入金期末金利支払 (残額:${totalLoan}万 / 率:${interestRate * 100}%)`
                  });
                }
              }
            }
            
            // 🧹 各種チップの完全返却（リセット）
            return {
              ...p,
              rdLevel: 0,
              adLevel: 0,
              hasInsurance: false,
              hasPac: false,
              hasMerchandiser: false,
              hasResearch: false,
              periods: {
                ...p.periods,
                [pPeriod]: {
                  ...periodData,
                  ledger: updatedLedger
                }
              }
            };
          }));

          setActiveTab('periodEnd');
          return;
        }
      }
      setCommonTurn(prev => prev + 1);
      
      setMarkets(prevMarkets => {
        const updated = { ...prevMarkets };
        Object.keys(updated).forEach(k => {
          updated[k] = {
            ...updated[k],
            materials: Math.min(updated[k].maxMaterials, updated[k].materials + (k === 'tokyo' ? 2 : 1))
          };
        });
        return updated;
      });

      addLog(`🕒 ターン ${commonTurn + 1} が開始されました。(全国の市場材料が自然回復しました)`);
    }

    setOrderIndex(nextOrderIndex);
    setCurrentCard(null);
    setActiveRiskEvent(null);
    setPhase('ruleB');
    setTurnStartTime(Date.now());
    playActionSound(); // 次の手番切り替え音
  };

  // ゲームの全体リセット
  const handleResetGame = () => {
    if (window.confirm(`【全データ完全初期化】\n4人のプレイヤー全員のすべてのデータを消去し、初期自己資本 ¥${initialCapital}万 にて山札を再構築して第1期首からリセットしますか？\n（この操作は取り消せません）`)) {
      const resetPlayers = JSON.parse(JSON.stringify(INITIAL_PLAYERS)).map(p => {
        // 設定された初期自己資本を注入
        p.periods[1].carryover.capital = initialCapital;
        p.periods[1].carryover.cash = initialCapital;
        p.periods[1].actuals.actualCash = initialCapital;
        return p;
      });
      
      setPlayers(resetPlayers);
      setCommonPeriod(1);
      setCommonTurn(0);
      setDeck(generateShuffledDeck());
      setCurrentCard(null);
      setActiveRiskEvent(null);
      setPhase('ruleB');
      setMarkets(JSON.parse(JSON.stringify(INITIAL_MARKETS)));
      setGameLogs(["🎲 戦略MG 新規対戦ゲームが開始しました！手番順がシャッフルされました。"]);
      
      const newOrder = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      setTurnOrder(newOrder);
      setOrderIndex(0);

      playFanfareSound();
      setActiveTab('gameboard');
    }
  };

  // 各自の期首設定
  const handleRollForward = (playerIdx) => {
    const p = players[playerIdx];
    if (p.currentPeriod <= 1) return;
    
    const prevPeriod = p.currentPeriod - 1;
    const prevData = p.periods[prevPeriod];
    if (!prevData) return;

    const prevResults = calculateFinancials(prevData.carryover, prevData.ledger, prevData.actuals);
    const prevBS = prevResults.bs;
    const prevMat = prevResults.mat;
    const prevWip = prevResults.wip;
    const prevProd = prevResults.prod;
    const prevMach = prevResults.machines;

    const nextCarryover = {
      cash: prevBS.cash,
      materialsCount: prevMat.endingCount,
      materialsValue: prevMat.endingValue,
      wipCount: prevWip.endingCount,
      wipValue: prevWip.endingValue,
      productCount: prevProd.endingCount,
      productValue: prevProd.endingValue,
      largeMachines: prevMach.large,
      smallMachines: prevMach.small,
      attachments: prevMach.attachments,
      machinesCount: prevMach.large + prevMach.small,
      machinesValue: prevBS.fixedAssets,
      loan: prevBS.loans,
      receivables: prevBS.receivables,
      payables: prevBS.payables,
      retainedEarnings: prevBS.retainedEarnings,
      capital: prevBS.capital,
      workers: prevResults.workers
    };

    if (window.confirm(`【期首引き継ぎ - ${p.name}】\n第${prevPeriod}期末の決算データを、第${p.currentPeriod}期の期首データとして引き継ぎますか？\n（自己資本: ¥${prevBS.totalNetAssets}万）`)) {
      setPlayers(prev => prev.map((item, idx) => {
        if (idx !== playerIdx) return item;
        return {
          ...item,
          periods: {
            ...item.periods,
            [item.currentPeriod]: {
              ...item.periods[item.currentPeriod],
              carryover: nextCarryover,
              actuals: {
                ...item.periods[item.currentPeriod].actuals,
                actualCash: prevBS.cash,
                actualMaterials: prevMat.endingCount,
                actualWip: prevWip.endingCount,
                actualProduct: prevProd.endingCount
              }
            }
          }
        };
      }));
      playActionSound();
      addLog(`⚙️ ${p.name} の第${p.currentPeriod}期首データ引継ぎが完了しました。`);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🎰</span>
          <span className="logo-text">戦略MG 1人プレイDX</span>
          <span className="logo-badge">Premium DX v3</span>
        </div>

        <nav className="tab-navigation">
          <button 
            onClick={() => setActiveTab('gameboard')} 
            className={`tab-btn ${activeTab === 'gameboard' ? 'active' : ''}`}
          >
            🎮 6大都市市場 ✕ 対戦ゲーム盤
          </button>

          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            🏆 企業比較
          </button>
          
          <button 
            onClick={() => setActiveTab('ledger')} 
            className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          >
            ✏️ 自社出納帳 (ずっきー)
          </button>

          <button 
            onClick={() => setActiveTab('statements')} 
            className={`tab-btn ${activeTab === 'statements' ? 'active' : ''}`}
          >
            📈 変動決算書
          </button>

          <button 
            onClick={() => setActiveTab('periodEnd')} 
            className={`tab-btn ${activeTab === 'periodEnd' ? 'active' : ''}`}
          >
            🏁 期末処理
          </button>

          <button 
            onClick={() => setActiveTab('settings')} 
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          >
            ⚙️ 設定・期首データ
          </button>
        </nav>

        <div className="header-controls">
          {/* 効果音クイックスイッチ */}
          <button 
            onClick={() => setSoundOn(!soundOn)} 
            className="btn" 
            style={{ 
              padding: '0 12px', 
              height: '36px', 
              marginRight: '8px',
              border: `1px solid ${soundOn ? 'var(--color-cyan)' : 'var(--border-light)'}`,
              color: soundOn ? 'var(--color-cyan)' : 'var(--text-secondary)'
            }}
          >
            {soundOn ? '🔊 音ON' : '🔇 音OFF'}
          </button>
          
          <button onClick={toggleTheme} className="btn" aria-label="Toggle theme" style={{ padding: '0 12px', height: '36px' }}>
            {theme === 'dark' ? '☀️ ライト' : '🌙 ダーク'}
          </button>
        </div>
      </header>

      <div className="main-workspace">
        <aside className="sidebar-panel" style={{ width: '300px' }}>
          <h4 className="sidebar-title">
            <span>📜</span> ゲーム実況ログ
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1, paddingRight: '5px' }}>
            {gameLogs.map((log, i) => (
              <div 
                key={i} 
                style={{ 
                  fontSize: '0.75rem', 
                  lineHeight: '1.4', 
                  background: 'rgba(255,255,255,0.01)', 
                  border: '1px solid var(--border-light)', 
                  padding: '8px', 
                  borderRadius: '6px',
                  color: log.includes('⚠️') || log.includes('🚨') || log.includes('🔥') || log.includes('💥') ? 'var(--color-red)' : 'var(--text-secondary)'
                }}
              >
                {log}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '15px', borderTop: '1px solid var(--border-light)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveGameData}>
              💾 JSONセーブデータを保存
            </button>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button 
                className="btn animate-pulse-neon" 
                style={{ 
                  width: '100%', 
                  fontSize: '0.72rem', 
                  padding: '6px 2px', 
                  background: 'rgba(5, 255, 161, 0.05)', 
                  border: '1.5px solid var(--color-green)', 
                  color: 'var(--color-green)',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }} 
                onClick={handleExportSummaryCsv}
              >
                📊 4社決算CSV
              </button>
              <button 
                className="btn animate-pulse-neon" 
                style={{ 
                  width: '100%', 
                  fontSize: '0.72rem', 
                  padding: '6px 2px', 
                  background: 'rgba(0, 242, 254, 0.05)', 
                  border: '1.5px solid var(--color-cyan)', 
                  color: 'var(--color-cyan)',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }} 
                onClick={handleExportLedgerCsv}
              >
                ✏️ 自社帳簿CSV
              </button>
            </div>
            
            <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleResetGame}>
              ⚠️ ゲームの全初期化
            </button>
          </div>
        </aside>

        <main className="content-workspace">
          <div className="workspace-bar">
            <div className="active-player-banner">
              <span 
                className="player-avatar" 
                style={{ 
                  background: activePlayer.color, 
                  width: '36px', 
                  height: '36px', 
                  fontSize: '1.1rem',
                  boxShadow: `0 0 12px ${activePlayer.color}` // プレミアムネオン発光エフェクト！
                }}
              >
                {activePlayer.name.charAt(0)}
              </span>
              <div className="active-player-title">
                手番: {activePlayer.name} 
                <span className="logo-badge" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-light)', color: activePlayer.color }}>
                  {activePlayer.isNpc ? `AI (${activePlayer.difficulty.toUpperCase()})` : "あなた (ずっきー)"}
                </span>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>手番順: </span>
              {turnOrder.map((idx, i) => {
                const isCurrent = i === orderIndex;
                const p = players[idx];
                return (
                  <span 
                    key={idx} 
                    style={{ 
                      fontWeight: isCurrent ? '800' : '400', 
                      color: p.color,
                      borderBottom: isCurrent ? `2px solid ${p.color}` : 'none',
                      paddingBottom: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    {p.name.split(" ")[0]}
                    {i < 3 && <span style={{ color: 'var(--text-muted)', fontWeight: '400', marginLeft: '3px' }}>➔</span>}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="workspace-scroll-area">
            {activeTab === 'gameboard' && (
              <DigitalBoard 
                players={players}
                activePlayerIdx={activePlayerIdx}
                commonPeriod={commonPeriod}
                commonTurn={commonTurn}
                currentCard={currentCard}
                activeRiskEvent={activeRiskEvent}
                deckLength={deck.length}
                phase={phase}
                markets={markets}
                gameLogs={gameLogs}
                turnOrder={turnOrder}
                orderIndex={orderIndex}
                onDrawCard={handleDrawCard}
                onDrawRiskEvent={handleDrawRiskEvent}
                onExecuteAction={handleExecuteAction}
                onEndTurn={handleEndTurn}
                onNpcPlay={handleNpcTurnPlay}
                onNpcAuction={handleRunAuctionWithNpcs}
                onEndRuleB={() => setPhase('draw')}
              />
            )}

            {activeTab === 'dashboard' && (
              <GlobalDashboard 
                players={players} 
                activePlayerIndex={activePlayerIdx}
                onSelectPlayer={() => {}}
                commonPeriod={commonPeriod}
                commonTurn={commonTurn}
                onIncrementTurn={handleEndTurn}
                onResetGame={handleResetGame}
              />
            )}

            {activeTab === 'ledger' && (
              <CashLedger 
                carryover={players[0].periods[players[0].currentPeriod].carryover}
                ledger={players[0].periods[players[0].currentPeriod].ledger}
                onUpdateLedger={(newLedger) => setPlayers(prev => prev.map((p, idx) => {
                  if (idx !== 0) return p;
                  return {
                    ...p,
                    periods: { ...p.periods, [p.currentPeriod]: { ...p.periods[p.currentPeriod], ledger: newLedger } }
                  };
                }))}
                results={calculateFinancials(
                  players[0].periods[players[0].currentPeriod].carryover,
                  players[0].periods[players[0].currentPeriod].ledger,
                  players[0].periods[players[0].currentPeriod].actuals
                )}
              />
            )}

            {activeTab === 'statements' && (
              <FinancialStatements 
                results={results}
                carryover={currentData.carryover}
              />
            )}

            {activeTab === 'periodEnd' && (
              (!currentData.ledger || currentData.ledger.length === 0) ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px', border: '1px solid rgba(255, 56, 56, 0.2)', boxShadow: '0 0 25px rgba(255,56,56,0.05)', maxWidth: '600px', margin: '30px auto' }}>
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: '15px' }}>⚠️</span>
                  <h3 style={{ color: 'var(--color-red)', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '10px' }}>
                    期末決算処理を行えません
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '25px' }}>
                    まだ今期のゲーム（取引）が開始されていないか、出納帳への起票履歴がありません。<br />
                    期末決算は、ゲームをプレイしてターンを完了した後に実行可能です。<br />
                    まずは<strong>「ゲーム盤」</strong>へ移動し、カードをドローして経営を進めましょう！
                  </p>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setActiveTab('gameboard')}
                    style={{ background: 'linear-gradient(135deg, var(--color-cyan), var(--color-purple))', border: 'none', color: '#000', fontWeight: 'bold', padding: '8px 25px', borderRadius: '6px' }}
                  >
                    🎮 ゲーム盤へ移動する
                  </button>
                </div>
              ) : (
                <PeriodEndWizard 
                  players={players}
                  commonPeriod={commonPeriod}
                  carryover={currentData.carryover}
                  ledger={currentData.ledger}
                  actuals={currentData.actuals}
                  onUpdateActuals={(newActuals) => setPlayers(prev => prev.map((p, idx) => {
                    if (idx !== activePlayerIdx) return p;
                    return {
                      ...p,
                      periods: { ...p.periods, [p.currentPeriod]: { ...p.periods[p.currentPeriod], actuals: newActuals } }
                    };
                  }))}
                  results={results}
                />
              )
            )}

            {activeTab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* A. プレミアム環境設定 (セーブロード・効果音) */}
                <div className="glass-card" style={{ marginBottom: 0 }}>
                  <div className="card-title-bar">
                    <h3 className="card-title" style={{ color: 'var(--color-cyan)' }}>💾 経営セーブデータ ✕ 環境設定</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginTop: '15px' }}>
                    
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '10px' }}>
                      <h4 style={{ color: '#fff', fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>💾 クラウド形式ローカルセーブ・ロード</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                        現在の経営データ（4社の出納帳、設備、山札、全国の市場残数）をファイルに保存して、いつでも同じ状態から再開できます。
                      </p>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={handleSaveGameData} style={{ fontSize: '0.8rem' }}>
                          💾 経営データを保存 (JSON)
                        </button>
                        
                        <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                          <button className="btn btn-success" style={{ fontSize: '0.8rem' }}>
                            📥 データを読込 (JSON)
                          </button>
                          <input 
                            type="file" 
                            accept=".json"
                            onChange={handleLoadGameData}
                            style={{ 
                              position: 'absolute', 
                              left: 0, 
                              top: 0, 
                              opacity: 0, 
                              cursor: 'pointer',
                              width: '100%',
                              height: '100%' 
                            }} 
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '10px' }}>
                      <h4 style={{ color: '#fff', fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>🎵 音響・SE設定 (Web Audio API 自作シンセ)</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                        カードドロー音、意思決定ポチッ音、落札時のファンファーレ音、リスクの災害効果音など、MGの臨場感を高めるレトロシンセ効果音の設定です。
                      </p>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input 
                            type="checkbox" 
                            checked={soundOn} 
                            onChange={(e) => setSoundOn(e.target.checked)} 
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          経営効果音 (SE) を有効にする
                        </label>
                      </div>
                    </div>

                  </div>
                </div>

                {/* C. 初期自己資本設定 */}
                <div className="glass-card" style={{ marginBottom: 0 }}>
                  <div className="card-title-bar">
                    <h3 className="card-title" style={{ color: 'var(--color-yellow)' }}>👑 戦略MG 新規ゲーム初期自己資本設定</h3>
                  </div>
                  <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      ゲームリセット時に、プレイヤー4社全員に適用される「第1期首の初期自己資本（資本金 ＝ 現金預金）」を設定します。(戦略MG標準は ¥300万 です)
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ width: '200px', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>初期自己資本（万円）</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          style={{ fontSize: '0.9rem', padding: '8px', fontWeight: 'bold', color: 'var(--color-yellow)', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)' }} 
                          value={initialCapital} 
                          min="100"
                          max="2000"
                          step="50"
                          onChange={(e) => setInitialCapital(Math.max(100, Number(e.target.value)))} 
                        />
                      </div>
                      
                      <button 
                        className="btn btn-danger animate-pulse" 
                        style={{ height: '38px', marginTop: '16px', fontSize: '0.82rem', fontWeight: 'bold', border: 'none', background: 'linear-gradient(135deg, #ff416c, #ff4b2b)', cursor: 'pointer' }}
                        onClick={handleResetGame}
                      >
                        ⚠️ 設定値を反映して新規ゲームをリセット ⚡
                      </button>
                    </div>
                  </div>
                </div>

                {/* B. NPC難易度設定 */}
                <div className="glass-card" style={{ marginBottom: 0 }}>
                  <div className="card-title-bar">
                    <h3 className="card-title" style={{ color: 'var(--color-cyan)' }}>🤖 NPCライバルAI難易度設定</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginTop: '15px' }}>
                    {players.filter(p => p.isNpc).map(p => (
                      <div key={p.id} style={{ background: 'rgba(255,255,255,0.01)', border: `1px solid ${p.color}`, padding: '15px', borderRadius: '10px' }}>
                        <h4 style={{ color: p.color, fontWeight: '700', marginBottom: '10px' }}>{p.name}</h4>
                        <div className="form-group">
                          <label>AIの難易度</label>
                          <select 
                            className="form-select"
                            value={p.difficulty}
                            onChange={(e) => setPlayers(prev => prev.map(item => {
                              if (item.id !== p.id) return item;
                              return { ...item, difficulty: e.target.value };
                            }))}
                          >
                            <option value={DIFFICULTY_LEVELS.EASY}>初級 (おっとり経営)</option>
                            <option value={DIFFICULTY_LEVELS.MEDIUM}>中級 (バランス経営)</option>
                            <option value={DIFFICULTY_LEVELS.HARD}>上級 (超攻撃的MQ経営)</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <PriorPeriodCarryover 
                  carryover={currentData.carryover}
                  onUpdateCarryover={(newCarryover) => setPlayers(prev => prev.map((p, idx) => {
                    if (idx !== activePlayerIdx) return p;
                    return {
                      ...p,
                      periods: { ...p.periods, [p.currentPeriod]: { ...p.periods[p.currentPeriod], carryover: newCarryover } }
                    };
                  }))}
                  currentPeriod={activePeriod}
                  periods={activePlayer.periods}
                  setCurrentPeriod={(p) => setPlayers(prev => prev.map((item, idx) => {
                    if (idx !== activePlayerIdx) return item;
                    return { ...item, currentPeriod: p };
                  }))}
                  rollForwardFromPrevious={() => handleRollForward(activePlayerIdx)}
                  resetAllData={() => setPlayers(prev => prev.map((p, idx) => {
                    if (idx !== activePlayerIdx) return p;
                    return { ...p, periods: INITIAL_PLAYERS[activePlayerIdx].periods };
                  }))}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
