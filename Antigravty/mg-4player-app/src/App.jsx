import React, { useState, useEffect } from 'react';
import { calculateFinancials, DEFAULT_PERIOD_DATA } from './utils/calculations';
import { generateShuffledDeck, CARD_TYPES } from './utils/cards';
import GlobalDashboard from './components/GlobalDashboard';
import DigitalBoard from './components/DigitalBoard';
import CashLedger from './components/CashLedger';
import FinancialStatements from './components/FinancialStatements';
import PeriodEndWizard from './components/PeriodEndWizard';
import PriorPeriodCarryover from './components/PriorPeriodCarryover';

// 初期プレイヤーデータ定義 (4人分)
const INITIAL_PLAYERS = [
  {
    name: "A社 (シアン)",
    color: "#00f2fe", // シアン
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
    name: "B社 (ピンク)",
    color: "#ff007f", // ネオンピンク
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
    name: "C社 (エメラルド)",
    color: "#05ffa1", // エメラルドグリーン
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
    name: "D社 (ゴールド)",
    color: "#ffd000", // ゴールド
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

function App() {
  // ダーク/ライトテーマ
  const [theme, setTheme] = useState(() => localStorage.getItem('mg4_theme') || 'dark');
  
  // 4人のプレイヤー状態
  const [players, setPlayers] = useState(() => {
    const saved = localStorage.getItem('mg4_players_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 後方互換性のため初期データ構造を保証
        return parsed;
      } catch (e) {
        console.error("Failed to parse players data", e);
      }
    }
    return JSON.parse(JSON.stringify(INITIAL_PLAYERS));
  });

  // アクティブな操作中プレイヤーインデックス (0〜3)
  const [activePlayerIdx, setActivePlayerIdx] = useState(() => {
    const saved = localStorage.getItem('mg4_active_player');
    return saved ? Number(saved) : 0;
  });

  // 共通のゲームマスター状態 (期数、ターン)
  const [commonPeriod, setCommonPeriod] = useState(() => Number(localStorage.getItem('mg4_common_period')) || 1);
  const [commonTurn, setCommonTurn] = useState(() => Number(localStorage.getItem('mg4_common_turn')) || 0);

  // デッキ・山札の状態
  const [deck, setDeck] = useState(() => {
    const saved = localStorage.getItem('mg4_deck');
    return saved ? JSON.parse(saved) : generateShuffledDeck();
  });
  const [currentCard, setCurrentCard] = useState(() => {
    const saved = localStorage.getItem('mg4_current_card');
    return saved ? JSON.parse(saved) : null;
  });
  const [phase, setPhase] = useState(() => localStorage.getItem('mg4_phase') || 'draw'); // draw, action, resolved

  // 市場の材料在庫数
  const [materialsInMarket, setMaterialsInMarket] = useState(() => {
    const saved = localStorage.getItem('mg4_market_materials');
    return saved ? Number(saved) : 40; // 初期40個
  });

  // アクティブなタブ (dashboard, gameboard, ledger, statements, periodEnd, settings)
  const [activeTab, setActiveTab] = useState('gameboard');

  // --- ローカルストレージ自動セーブ ---
  useEffect(() => {
    localStorage.setItem('mg4_players_data', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem('mg4_active_player', String(activePlayerIdx));
  }, [activePlayerIdx]);

  useEffect(() => {
    localStorage.setItem('mg4_common_period', String(commonPeriod));
    localStorage.setItem('mg4_common_turn', String(commonTurn));
  }, [commonPeriod, commonTurn]);

  useEffect(() => {
    localStorage.setItem('mg4_deck', JSON.stringify(deck));
    if (currentCard) {
      localStorage.setItem('mg4_current_card', JSON.stringify(currentCard));
    } else {
      localStorage.removeItem('mg4_current_card');
    }
    localStorage.setItem('mg4_phase', phase);
    localStorage.setItem('mg4_market_materials', String(materialsInMarket));
  }, [deck, currentCard, phase, materialsInMarket]);

  // テーマ切り替え
  useEffect(() => {
    const body = document.body;
    if (theme === 'light') {
      body.classList.add('light-theme');
    } else {
      body.classList.remove('light-theme');
    }
    localStorage.setItem('mg4_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // --- 計算エンジン連携 ---
  const activePlayer = players[activePlayerIdx];
  const activePeriod = activePlayer.currentPeriod;
  const currentData = activePlayer.periods[activePeriod] || JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA));
  const results = calculateFinancials(currentData.carryover, currentData.ledger, currentData.actuals);

  // --- デジタル対戦ゲームロジック ---

  // カードを山札から引く
  const handleDrawCard = () => {
    if (phase !== 'draw') return;
    
    if (deck.length === 0) {
      alert("山札がなくなりました！山札を再シャッフルします。");
      const reshuffled = generateShuffledDeck();
      setDeck(reshuffled);
      return;
    }

    const nextDeck = [...deck];
    const card = nextDeck.pop();
    setDeck(nextDeck);
    setCurrentCard(card);
    setPhase('action');
  };

  // デジタルアクションの実行 ＆ 自動仕訳適用
  const handleExecuteAction = (type, payload) => {
    setPlayers(prev => prev.map((p, idx) => {
      // 基本は手番プレイヤーが対象
      const isTarget = idx === activePlayerIdx;
      
      // 競合オークション（ネ）の場合は、落札者が対象
      const isAuctionWinner = type === CARD_TYPES.SALE_AUCTION && idx === payload.winnerIdx;

      // 対象外の場合はそのまま返す
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

      // カードのアクションタイプに応じて、出納帳への仕訳と工場状態を自動処理
      switch (type) {
        
        // 1. 仕入 (ツ)
        case CARD_TYPES.PURCHASE:
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "ツ",
              amount: payload.qty * payload.price,
              quantity: payload.qty,
              memo: `材料仕入（単価:${payload.price}万）`
            });
            // 市場材料数を減少
            setMaterialsInMarket(prev => Math.max(0, prev - payload.qty));
          }
          break;

        // 2. 製造 (コ・サ)
        case CARD_TYPES.PRODUCE:
          if (isTarget) {
            if (payload.type === 'input') {
              // 投入 (コ)
              newLedger.push({
                id: generateId(),
                category: "コ",
                amount: 0, // 平均材料単価は calculations.js が自動計算
                quantity: payload.qty,
                memo: `材料投入`
              });
            } else {
              // 完成 (サ) - 加工費が発生（1個あたり¥10万等）
              const totalProcessingCost = payload.qty * 10;
              newLedger.push({
                id: generateId(),
                category: "サ",
                amount: totalProcessingCost,
                quantity: payload.qty,
                memo: `完成加工費`
              });
            }
          }
          break;

        // 3. 直接販売 (キ)
        case CARD_TYPES.SALE_DIRECT:
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "キ", // 現金売上
              amount: payload.qty * payload.price,
              quantity: payload.qty,
              memo: `直接販売（単価:${payload.price}万）`
            });
          }
          break;

        // 4. 競合入札 (ネ)
        case CARD_TYPES.SALE_AUCTION:
          if (isAuctionWinner) {
            newLedger.push({
              id: generateId(),
              category: "ネ", // 売掛・売上
              amount: payload.qty * payload.price,
              quantity: payload.qty,
              memo: `入札落札（単価:${payload.price}万）`
            });
            alert(`🎉 ${p.name} に売上 ¥${payload.qty * payload.price}万 が自動計上されました！`);
          }
          break;

        // 5. 機械購入 (ケ)
        case CARD_TYPES.BUY_MACHINE:
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
          }
          break;

        // 6. 雇用 (シ)
        case CARD_TYPES.HIRE:
          if (isTarget) {
            newCarryover.workers = (newCarryover.workers || 3) + 1;
            newLedger.push({
              id: generateId(),
              category: "シ", // 労務費
              amount: 30, // 雇用時の経費
              quantity: 1,
              memo: `社員新規雇用（社員数:${newCarryover.workers}人）`
            });
          }
          break;

        // 7. 借入 (オ)
        case CARD_TYPES.LOAN:
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "オ", // 借入金
              amount: payload.amount,
              quantity: 0,
              memo: `資金調達（借入）`
            });
          }
          break;

        // 8. 研究開発 (チ)
        case CARD_TYPES.RD:
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "チ", // 研究開発費
              amount: 20,
              quantity: 0,
              memo: `研究開発投資`
            });
          }
          break;

        // 9. 広告 (セ)
        case CARD_TYPES.AD:
          if (isTarget) {
            newLedger.push({
              id: generateId(),
              category: "セ", // 販売費
              amount: 10,
              quantity: 0,
              memo: `広告宣伝出金`
            });
          }
          break;

        // 10. 災害：火災 (材料2個ロスト)
        case CARD_TYPES.RISK_FIRE:
          if (isTarget) {
            newActuals.fireCount = (newActuals.fireCount || 0) + 2;
            alert(`🔥 火災適用: ${p.name} の材料在庫が 2個 消失しました。`);
          }
          break;

        // 11. 災害：製造ミス (仕掛品1個ロスト)
        case CARD_TYPES.RISK_MISS:
          if (isTarget) {
            newActuals.missCount = (newActuals.missCount || 0) + 1;
            alert(`💥 ミス適用: ${p.name} の仕掛品在庫が 1個 消失しました。`);
          }
          break;

        // 12. 災害：盗難 (製品1個ロスト)
        case CARD_TYPES.RISK_THEFT:
          if (isTarget) {
            newActuals.theftCount = (newActuals.theftCount || 0) + 1;
            alert(`🕵️ 盗難適用: ${p.name} の製品在庫が 1個 消失しました。`);
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

    setPhase('resolved');
  };

  // 手番の終了 ＆ 次プレイヤーへスイッチ
  const handleEndTurn = () => {
    if (phase !== 'resolved') return;

    // 次のプレイヤーを算出
    const nextPlayerIdx = (activePlayerIdx + 1) % 4;

    // もし4人の手番が一周したら、全体のターンを進める
    if (nextPlayerIdx === 0) {
      if (commonTurn >= 30) {
        if (window.confirm("第30ターン（最終ターン）が終了しました。期末決算処理を行いますか？")) {
          setActiveTab('periodEnd');
          return;
        }
      }
      setCommonTurn(prev => prev + 1);
      // 市場の材料在庫数を毎ターン少し回復
      setMaterialsInMarket(prev => Math.min(60, prev + 5));
    }

    setActivePlayerIdx(nextPlayerIdx);
    setCurrentCard(null);
    setPhase('draw');
  };

  // ゲームの全体リセット
  const handleResetGame = () => {
    if (window.confirm("【全データ完全初期化】\n4人のプレイヤー全員のすべてのデータを消去し、山札を再構築して第1期首からリセットしますか？\n（この操作は取り消せません）")) {
      setPlayers(JSON.parse(JSON.stringify(INITIAL_PLAYERS)));
      setActivePlayerIdx(0);
      setCommonPeriod(1);
      setCommonTurn(0);
      setDeck(generateShuffledDeck());
      setCurrentCard(null);
      setPhase('draw');
      setMaterialsInMarket(40);
      setActiveTab('gameboard');
    }
  };

  // プレイヤー個々の現在期変更
  const handleChangePlayerPeriod = (playerIdx, newPeriod) => {
    setPlayers(prev => prev.map((p, idx) => {
      if (idx !== playerIdx) return p;
      return {
        ...p,
        currentPeriod: newPeriod
      };
    }));
  };

  // 期首引き継ぎ
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
      alert(`${p.name} の期首を設定しました！`);
    }
  };

  return (
    <div className="app-container">
      {/* トップヘッダー */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🎰</span>
          <span className="logo-text">戦略MG デジタル対戦</span>
          <span className="logo-badge">完全デジタル A</span>
        </div>

        {/* ナビゲーション */}
        <nav className="tab-navigation">
          <button 
            onClick={() => setActiveTab('gameboard')} 
            className={`tab-btn ${activeTab === 'gameboard' ? 'active' : ''}`}
          >
            🎮 デジタルゲーム盤
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
            ✏️ 自社出納帳
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
            ⚙️ 期首設定
          </button>
        </nav>

        <div className="header-controls">
          <button onClick={toggleTheme} className="btn" aria-label="Toggle theme" style={{ padding: '0 12px', height: '36px' }}>
            {theme === 'dark' ? '☀️ ライト' : '🌙 ダーク'}
          </button>
        </div>
      </header>

      {/* スプリットレイアウト */}
      <div className="main-workspace">
        
        {/* 左サイドバー：競合4社のステータスカード（常に視認可能） */}
        <aside className="sidebar-panel">
          <h4 className="sidebar-title">
            <span>👥</span> 競合4社ダッシュ
          </h4>
          
          <div className="players-ranking-list">
            {players.map((p, idx) => {
              const isActive = idx === activePlayerIdx;
              const currentData = p.periods[p.currentPeriod] || { carryover: {}, ledger: [], actuals: {} };
              const results = calculateFinancials(currentData.carryover, currentData.ledger, currentData.actuals);
              
              return (
                <div 
                  key={idx}
                  onClick={() => setActivePlayerIdx(idx)}
                  className={`player-rank-card ${isActive ? 'active' : ''}`}
                  style={{ '--player-color': p.color }}
                >
                  <div className="card-row-top">
                    <div className="player-name-wrapper">
                      <div className="player-avatar" style={{ background: p.color }}>
                        {p.name.charAt(0)}
                      </div>
                      <span className="player-name" style={{ color: isActive ? '#fff' : 'inherit' }}>
                        {p.name}
                      </span>
                    </div>
                    <span className="player-rank-badge">
                      第{p.currentPeriod}期
                    </span>
                  </div>

                  <div className="card-metrics-grid">
                    <div className="metric-mini-item">
                      <span className="metric-mini-label">現金残高</span>
                      <span className="metric-mini-value value-cyan">¥{results.bookEndingCash}万</span>
                    </div>
                    <div className="metric-mini-item">
                      <span className="metric-mini-label">自己資本</span>
                      <span className="metric-mini-value value-yellow">¥{results.bs.totalNetAssets}万</span>
                    </div>
                  </div>

                  {/* 簡易在庫表示 */}
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '5px', borderTop: '1px dashed var(--border-light)', paddingTop: '4px' }}>
                    <span>材料:{results.mat.endingCount}</span>
                    <span>仕掛:{results.wip.endingCount}</span>
                    <span>製品:{results.prod.endingCount}</span>
                    <span>機械:{results.machines.large + results.machines.small}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 右メインワークスペース */}
        <main className="content-workspace">
          
          {/* 現在操作中プレイヤー情報 */}
          <div className="workspace-bar">
            <div className="active-player-banner">
              <span 
                className="player-avatar" 
                style={{ background: activePlayer.color, width: '36px', height: '36px', fontSize: '1.1rem' }}
              >
                {activePlayer.name.charAt(0)}
              </span>
              <div className="active-player-title">
                {activePlayer.name}
                <span className="logo-badge" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-light)', color: activePlayer.color }}>
                  第 {activePeriod} 期首自己資本: ¥{currentData.carryover.capital + currentData.carryover.retainedEarnings}万
                </span>
              </div>
            </div>
            
            <div className="period-select-wrapper">
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>操作中の期:</span>
              <select 
                className="form-select" 
                style={{ height: '32px', padding: '0 8px', fontSize: '0.8rem' }}
                value={activePeriod}
                onChange={(e) => handleChangePlayerPeriod(activePlayerIdx, Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map(pr => (
                  <option key={pr} value={pr}>第 {pr} 期</option>
                ))}
              </select>
            </div>
          </div>

          {/* ワークスペーススクロールエリア */}
          <div className="workspace-scroll-area">
            {activeTab === 'gameboard' && (
              <DigitalBoard 
                players={players}
                activePlayerIdx={activePlayerIdx}
                commonPeriod={commonPeriod}
                commonTurn={commonTurn}
                currentCard={currentCard}
                deckLength={deck.length}
                phase={phase}
                materialsInMarket={materialsInMarket}
                onDrawCard={handleDrawCard}
                onExecuteAction={handleExecuteAction}
                onEndTurn={handleEndTurn}
              />
            )}

            {activeTab === 'dashboard' && (
              <GlobalDashboard 
                players={players} 
                activePlayerIndex={activePlayerIdx}
                onSelectPlayer={setActivePlayerIdx}
                commonPeriod={commonPeriod}
                commonTurn={commonTurn}
                onIncrementTurn={handleEndTurn} // 手動進行もEndTurnに連動可能
                onResetGame={handleResetGame}
              />
            )}

            {activeTab === 'ledger' && (
              <CashLedger 
                carryover={currentData.carryover}
                ledger={currentData.ledger}
                onUpdateLedger={(newLedger) => setPlayers(prev => prev.map((p, idx) => {
                  if (idx !== activePlayerIdx) return p;
                  return {
                    ...p,
                    periods: { ...p.periods, [activePeriod]: { ...p.periods[activePeriod], ledger: newLedger } }
                  };
                }))}
                results={results}
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
                    periods: { ...p.periods, [activePeriod]: { ...p.periods[activePeriod], actuals: newActuals } }
                  };
                }))}
                results={results}
              />
            )}

            {activeTab === 'settings' && (
              <PriorPeriodCarryover 
                carryover={currentData.carryover}
                onUpdateCarryover={(newCarryover) => setPlayers(prev => prev.map((p, idx) => {
                  if (idx !== activePlayerIdx) return p;
                  return {
                    ...p,
                    periods: { ...p.periods, [activePeriod]: { ...p.periods[activePeriod], carryover: newCarryover } }
                  };
                }))}
                currentPeriod={activePeriod}
                periods={activePlayer.periods}
                setCurrentPeriod={(p) => handleChangePlayerPeriod(activePlayerIdx, p)}
                rollForwardFromPrevious={() => handleRollForward(activePlayerIdx)}
                resetAllData={() => setPlayers(prev => prev.map((p, idx) => {
                  if (idx !== activePlayerIdx) return p;
                  return { ...p, periods: INITIAL_PLAYERS[activePlayerIdx].periods };
                }))}
              />
            )}
          </div>
        </main>

      </div>
    </div>
  );
}

export default App;
