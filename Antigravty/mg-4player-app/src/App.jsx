import React, { useState, useEffect } from 'react';
import { calculateFinancials, DEFAULT_PERIOD_DATA } from './utils/calculations';
import { generateShuffledDeck, CARD_CATEGORIES, drawRandomRiskEvent } from './utils/cards';
import { decideNpcAction, decideNpcBid, DIFFICULTY_LEVELS } from './utils/npcAi';
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
  sapporo: { id: "sapporo", name: "札幌市場", materials: 6, maxMaterials: 8, baseFreight: 2, salesHistory: [] },
  sendai: { id: "sendai", name: "仙台市場", materials: 6, maxMaterials: 8, baseFreight: 1, salesHistory: [] },
  tokyo: { id: "tokyo", name: "東京市場", materials: 14, maxMaterials: 20, baseFreight: 0, salesHistory: [] },
  nagoya: { id: "nagoya", name: "名古屋市場", materials: 6, maxMaterials: 8, baseFreight: 0, salesHistory: [] },
  osaka: { id: "osaka", name: "大阪市場", materials: 8, maxMaterials: 12, baseFreight: 0, salesHistory: [] },
  fukuoka: { id: "fukuoka", name: "福岡市場", materials: 6, maxMaterials: 8, baseFreight: 2, salesHistory: [] }
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

  const [phase, setPhase] = useState(() => safeLocalStorage.getItem('mg4_phase_v3') || 'draw'); // draw, action, resolved

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

  // --- ドロー処理 (多段階リスクドロー対応) ---
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
    setActiveRiskEvent(null); // リスクは後から引くため最初はnull

    if (card.category === CARD_CATEGORIES.RISK) {
      addLog(`🚨 ${activePlayer.name} は [リスクカード] をドロー！(コマンドを実行して、具体的なリスクイベントを引いてください)`);
    } else {
      addLog(`🧠 ${activePlayer.name} は [意思決定カード (Decision)] をドローしました！自由なアクションを選択できます。`);
    }
  };

  // コマンドを実行して、リスクの内容をドローする（多段階ドロー！）
  const handleDrawRiskEvent = () => {
    if (phase !== 'action' || !currentCard || currentCard.category !== CARD_CATEGORIES.RISK) return;

    const riskEvent = drawRandomRiskEvent();
    setActiveRiskEvent(riskEvent);
    addLog(`🎲 リスクカードを開封 ➔ 💥【${riskEvent.title}】が確定しました！`);
  };

  // アクション適用処理
  const handleExecuteAction = (type, payload) => {
    let actionLogText = "";

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
            newLedger.push({
              id: generateId(),
              category: "ツ",
              amount: payload.qty * payload.price,
              quantity: payload.qty,
              memo: `材料仕入（単価:${payload.price}万 / ${INITIAL_MARKETS[payload.marketId].name}）`
            });
            
            setMarkets(prevMarkets => {
              const updated = { ...prevMarkets };
              updated[payload.marketId] = {
                ...updated[payload.marketId],
                materials: Math.max(0, updated[payload.marketId].materials - payload.qty)
              };
              return updated;
            });

            actionLogText = `📥 [仕入] ${p.name} が ${INITIAL_MARKETS[payload.marketId].name} から材料を ${payload.qty} 個仕入れました (計 ¥${payload.qty * payload.price}万)`;
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

    if (actionLogText) {
      addLog(actionLogText);
    }
    setPhase('resolved');
  };

  // AI(NPC)の手番プレイ
  const handleNpcTurnPlay = () => {
    if (!activePlayer.isNpc || phase !== 'action') return;

    // AIも多段階ドローに対応：リスクカードだった場合はまずリスクイベントをドローする！
    if (currentCard.category === CARD_CATEGORIES.RISK) {
      if (!activeRiskEvent) {
        // まだ引いていなければ、まずリスクイベントを引き当てる！
        const riskEvent = drawRandomRiskEvent();
        setActiveRiskEvent(riskEvent);
        addLog(`🎲 AIライバル ${activePlayer.name} がリスクカードを開封 ➔ 💥【${riskEvent.title}】`);
        return; // 次のタップ、または処理で適用へ
      }
      handleExecuteAction(activeRiskEvent.actionType, {});
      return;
    }

    // 意思決定（Decision）カードの場合
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
        setPhase('resolved');
        return;
      }
    }

    handleExecuteAction(finalType, finalPayload);
  };

  // AI対戦オークション
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
    setPhase('draw');
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
      setPhase('draw');
      setMarkets(JSON.parse(JSON.stringify(INITIAL_MARKETS)));
      setGameLogs(["🎲 戦略MG 新規対戦ゲームが開始しました！手番順がシャッフルされました。"]);
      
      const newOrder = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      setTurnOrder(newOrder);
      setOrderIndex(0);

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
      addLog(`⚙️ ${p.name} の第${p.currentPeriod}期首データ引継ぎが完了しました。`);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🎰</span>
          <span className="logo-text">戦略MG 1人プレイDX</span>
          <span className="logo-badge">正規ルール準拠</span>
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
            ⚙️ 期首設定・NPC難易度
          </button>
        </nav>

        <div className="header-controls">
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

          <div style={{ marginTop: '15px', borderTop: '1px solid var(--border-light)', paddingTop: '15px' }}>
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
                style={{ background: activePlayer.color, width: '36px', height: '36px', fontSize: '1.1rem' }}
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
                onDrawCard={handleDrawCard}
                onDrawRiskEvent={handleDrawRiskEvent} // 追加したドローコマンド
                onExecuteAction={handleExecuteAction}
                onEndTurn={handleEndTurn}
                onNpcPlay={handleNpcTurnPlay}
                onNpcAuction={handleRunAuctionWithNpcs}
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
