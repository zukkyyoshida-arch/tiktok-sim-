import React, { useState, useEffect } from 'react';
import { calculateFinancials, DEFAULT_PERIOD_DATA } from './utils/calculations';
import { generateShuffledDeck, CARD_CATEGORIES, drawRandomRiskEvent } from './utils/cards';
import { decideNpcAction, decideNpcBid, DIFFICULTY_LEVELS } from './utils/npcAi';
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
    currentPeriod: 1,
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
    currentPeriod: 1,
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
    currentPeriod: 1,
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
    currentPeriod: 1,
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
            if (payload.type === 'input') {
              newLedger.push({
                id: generateId(),
                category: "コ",
                amount: 0,
                quantity: payload.qty,
                memo: `材料投入`
              });
              actionLogText = `⚙️ [投入] ${p.name} が材料 ${payload.qty} 個を工場ラインへ投入しました。`;
            } else {
              const totalProcessingCost = payload.qty * 10;
              newLedger.push({
                id: generateId(),
                category: "サ",
                amount: totalProcessingCost,
                quantity: payload.qty,
                memo: `完成加工費`
              });
              actionLogText = `🏭 [完成] ${p.name} が製品を ${payload.qty} 個完成させました (加工費: ¥${totalProcessingCost}万)`;
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
            let price = 0;
            let label = "";
            if (payload.type === 'small') {
              price = 40;
              label = "小型機械";
              newCarryover.smallMachines = (newCarryover.smallMachines || 0) + 1;
            } else if (payload.type === 'large') {
              price = 80;
              label = "大型機械";
              newCarryover.largeMachines = (newCarryover.largeMachines || 0) + 1;
            } else if (payload.type === 'attachment') {
              price = 10;
              label = "アタッチメント";
              newCarryover.attachments = (newCarryover.attachments || 0) + 1;
            }
            newCarryover.machinesCount = (newCarryover.largeMachines || 0) + (newCarryover.smallMachines || 0);

            newLedger.push({
              id: generateId(),
              category: "ケ",
              amount: price,
              quantity: 1,
              memo: `${label}購入`
            });
            actionLogText = `🏗️ [機械購入] ${p.name} が ${label} を ¥${price}万 で購入しました。`;
          }
          break;

        case "hire":
          if (isTarget) {
            newCarryover.workers = (newCarryover.workers || 3) + 1;
            newLedger.push({
              id: generateId(),
              category: "シ",
              amount: 30,
              quantity: 1,
              memo: `社員新規雇用（社員数:${newCarryover.workers}人）`
            });
            actionLogText = `👤 [雇用] ${p.name} が社員を新規雇用しました。(合計: ${newCarryover.workers}人)`;
          }
          break;

        case "loan":
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "オ",
              amount: payload.amount,
              quantity: 0,
              memo: `資金調達（借入）`
            });
            actionLogText = `🏦 [融資] ${p.name} が銀行から ¥${payload.amount}万 を借入しました。`;
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
            actionLogText = `🔥 [火災災害] ${p.name} で火災が発生し、材料 2個 が焼失しました！`;
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
            actionLogText = `🕵️ [製品盗難] ${p.name} で盗難が発生し、完成品製品 1個 が紛失しました！`;
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

      return {
        ...p,
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

      // 1. お金が十分（¥150万以上）かつ機械台数が少ない場合 ➔ 機械購入
      if (npcRes.bookEndingCash >= 150 && (npcRes.machines.large + npcRes.machines.small) < 2) {
        handleExecuteAction("buy_machine", { type: "small" });
        setPhase('draw'); // 実行後、ドローへ移行
        return;
      }
      
      // 2. お金が十分（¥120万以上）かつ社員が3名未満の場合 ➔ 雇用
      if (npcRes.bookEndingCash >= 120 && npcRes.workers < 3) {
        handleExecuteAction("hire", {});
        setPhase('draw');
        return;
      }
      
      // 3. 原料仕掛品（WIP）があり、完成できる場合 ➔ 製造完成 (加工費: ¥10万/個)
      if (npcRes.wip.endingCount > 0 && npcRes.bookEndingCash >= 50) {
        const qtyToProduce = Math.min(npcRes.wip.endingCount, npcRes.workers * 2);
        handleExecuteAction("produce", { type: "complete", qty: qtyToProduce });
        setPhase('draw');
        return;
      }
      
      // 特にやることがなければ、そのままドローへ移行
      setPhase('draw');
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
    
    const decisionCardSim = { type: "purchase" };
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

    let highestPrice = -1;
    let winnerIdx = -1;

    Object.entries(bids).forEach(([idxStr, price]) => {
      const idx = Number(idxStr);
      if (price > highestPrice) {
        highestPrice = price;
        winnerIdx = idx;
      }
    });

    const marketName = INITIAL_MARKETS[marketId].name;
    const bidInfo = players.map(p => `${p.name}: ¥${bids[p.id]}万`).join(", ");
    addLog(`⚔️ [${marketName}入札結果] 一覧: ${bidInfo}`);

    handleExecuteAction("sale_auction", { winnerIdx, price: highestPrice, qty, marketId });
  };

  // 手番の終了 ➔ 次へ
  const handleEndTurn = () => {
    if (phase !== 'resolved') return;

    const nextOrderIndex = (orderIndex + 1) % 4;

    if (nextOrderIndex === 0) {
      if (commonTurn >= 30) {
        if (window.confirm("第30ターン（最終ターン）が終了しました。期末決算処理を行いますか？")) {
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
    playActionSound(); // 次の手番切り替え音
  };

  // ゲームの全体リセット
  const handleResetGame = () => {
    if (window.confirm("【全データ完全初期化】\n4人のプレイヤー全員のすべてのデータを消去し、山札を再構築して第1期首からリセットしますか？\n（この操作は取り消せません）")) {
      setPlayers(JSON.parse(JSON.stringify(INITIAL_PLAYERS)));
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
              <PeriodEndWizard 
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
