import React, { useState, useEffect } from 'react';
import { CARD_CATEGORIES } from '../utils/cards';
import { calculateFinancials } from '../utils/calculations';
import { decideNpcBid } from '../utils/npcAi';
import { playActionSound, playRiskConfirmSound, playFanfareSound } from '../utils/soundEffects';

function DigitalBoard({ 
  players, 
  activePlayerIdx, 
  commonPeriod, 
  commonTurn, 
  currentCard, 
  activeRiskEvent, 
  deckLength, 
  phase, 
  markets, 
  gameLogs = [], 
  turnOrder = [],
  orderIndex = 0,
  onDrawCard,
  onDrawRiskEvent,
  onExecuteAction,
  onEndTurn,
  onNpcPlay,
  onNpcAuction,
  onEndRuleB
}) {
  const activePlayer = players[activePlayerIdx] || players[0];
  const isSelf = activePlayer.id === 0;

  // 意思決定カードの時に選択中のアクションタイプ
  const [selectedActionType, setSelectedActionType] = useState('buy_chip'); 

  // アクション用パラメータ
  const [targetMarketId, setTargetMarketId] = useState('tokyo'); 
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [produceType, setProduceType] = useState('input'); 
  const [produceQty, setProduceQty] = useState(1);
  const [directSalePrice, setDirectSalePrice] = useState(25);
  const [directSaleQty, setDirectSaleQty] = useState(1);
  const [machineType, setMachineType] = useState('small');
  const [loanAmount, setLoanAmount] = useState(50);
  const [hireType, setHireType] = useState('prod'); // 'prod' (ワーカー) または 'sales' (セールスマン)
  
  // 新規追加ルールB用パラメータ
  const [chipType, setChipType] = useState('insurance'); // 'insurance' | 'pac' | 'merchandiser' | 'research'
  const [selectedChips, setSelectedChips] = useState([]); // 一括チップ購入用配列
  const [transferTo, setTransferTo] = useState('prod'); // 'prod' (ワーカーへ) または 'sales' (セールスマンへ)
  const [sellMachineType, setSellMachineType] = useState('small'); // 'small' | 'large' | 'attachment'
  const [repayAmount, setRepayAmount] = useState(50);

  // オークション入札パラメータ
  const [yourBidPrice, setYourBidPrice] = useState(26);
  const [auctionQty, setAuctionQty] = useState(2);

  // オークションアリーナ特設演出用ステート
  const [arenaOpen, setArenaOpen] = useState(false);
  const [arenaState, setArenaState] = useState('thinking'); 
  const [arenaBids, setArenaBids] = useState({});
  const [arenaWinnerIdx, setArenaWinnerIdx] = useState(-1);
  const [arenaWinnerPrice, setArenaWinnerPrice] = useState(-1);
  const [revealedCounts, setRevealedCounts] = useState(0); 
  const [npcThinkingValues, setNpcThinkingValues] = useState({ 1: 20, 2: 20, 3: 20 });

  // 複数市場からの仕入数量ステート
  const [purchaseQuantities, setPurchaseQuantities] = useState({
    sapporo: 0,
    sendai: 0,
    tokyo: 0,
    nagoya: 0,
    osaka: 0,
    fukuoka: 0
  });

  // 生産能力と仕入上限数（生産能力の2倍）の算出
  const activePeriod = activePlayer.currentPeriod || 1;
  const pData = activePlayer.periods?.[activePeriod] || { carryover: {}, ledger: [], actuals: {} };
  const pRes = calculateFinancials(pData.carryover || {}, pData.ledger || [], pData.actuals || {});
  const myMachines = pRes.machines || { large: 0, small: 0, attachments: 0 };
  
  // 今期のこれまでの仕訳から、現在のワーカー数（workersProd）とセールスマン数（workersSales）を正確に算出
  let myWorkersProd = pData.carryover?.workersProd !== undefined ? pData.carryover.workersProd : 2;
  let myWorkersSales = pData.carryover?.workersSales !== undefined ? pData.carryover.workersSales : 1;
  
  if (pData.ledger && Array.isArray(pData.ledger)) {
    pData.ledger.forEach(entry => {
      if (entry.category === 'ソ' && entry.memo?.includes('新規採用（ワーカー）')) {
        myWorkersProd += (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('新規採用（セールスマン）')) {
        myWorkersSales += (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('配置転換（ワーカーに移動）')) {
        myWorkersProd += (Number(entry.quantity) || 0);
        myWorkersSales -= (Number(entry.quantity) || 0);
      }
      if (entry.category === 'ソ' && entry.memo?.includes('配置転換（セールスマンに移動）')) {
        myWorkersProd -= (Number(entry.quantity) || 0);
        myWorkersSales += (Number(entry.quantity) || 0);
      }
    });
  }

  // ワーカー数に応じた機械の稼働判定 (大型 -> 小型 の順にワーカーを割り当て)
  let activeLarge = 0;
  let activeSmall = 0;
  let remainingWorkers = myWorkersProd;
  
  activeLarge = Math.min(myMachines.large || 0, remainingWorkers);
  remainingWorkers -= activeLarge;
  
  activeSmall = Math.min(myMachines.small || 0, remainingWorkers);
  remainingWorkers -= activeSmall;
  
  // ジュニア・ルール: アタッチメントは小型機械に対してのみ有効
  const activeAttach = Math.min(myMachines.attachments || 0, activeSmall);
  
  // 基本生産能力: 大型4個、小型1個、アタッチ+1個
  const baseCapacity = (activeLarge * 4) + (activeSmall * 1) + activeAttach;
  
  // PAC生産性 (緑チップ) のブースト: 稼働している機械（大型+小型）1台につき+1個
  const pacBoost = activePlayer.hasPac ? (activeLarge + activeSmall) : 0;
  
  const prodCapacity = baseCapacity + pacBoost;
  const maxAllowedQty = Math.max(2, prodCapacity * 2); // 最低でも2個は仕入可能

  // ジュニア・ルール公式販売能力: セールスマン数×2 ＋ 有効広告チップ(赤)数×2
  const maxAdLimit = myWorkersSales * 2; // セールスマン1人につき広告2枚まで有効
  const effectiveAdLevel = Math.min(activePlayer.adLevel || 0, maxAdLimit);
  const salesCapacity = (myWorkersSales * 2) + (effectiveAdLevel * 2);

  // 価格競争力（お客様の値ごろ感補正値）
  const parentIdx = (turnOrder && turnOrder[orderIndex] !== undefined) ? turnOrder[orderIndex] : activePlayerIdx;
  const isParent = activePlayerIdx === parentIdx;
  const priceCompetitiveness = (isParent ? 2 : 0) + ((activePlayer.rdLevel || 0) * 2);

  // 合計仕入希望数量
  const totalPurchaseQty = Object.values(purchaseQuantities).reduce((a, b) => a + b, 0);

  // 各市場の残数チェックと合計仕入希望数のバリデーション関数
  const handleUpdatePurchaseQty = (marketId, val) => {
    const market = markets[marketId];
    if (!market) return;
    
    const qty = Math.max(0, Number(val));
    const currentOtherTotal = Object.entries(purchaseQuantities)
      .filter(([id]) => id !== marketId)
      .reduce((sum, [, q]) => sum + q, 0);
      
    // 市場残数および全体上限（生産能力の2倍）を超えないようにクリップ
    const allowedForThisMarket = Math.min(market.materials, maxAllowedQty - currentOtherTotal);
    const finalQty = Math.min(qty, allowedForThisMarket);
    
    setPurchaseQuantities(prev => ({
      ...prev,
      [marketId]: finalQty
    }));
  };

  // フェーズに応じて選択できるアクションタイプを自動補正
  useEffect(() => {
    if (phase === 'ruleB') {
      const validRuleBTypes = ['buy_chip', 'transfer_worker', 'sell_machine', 'loan', 'repay'];
      if (!validRuleBTypes.includes(selectedActionType)) {
        setSelectedActionType('buy_chip');
      }
    } else {
      const validRuleATypes = ['purchase', 'produce', 'sale_direct', 'sale_auction', 'buy_machine', 'hire', 'rd', 'ad'];
      if (!validRuleATypes.includes(selectedActionType)) {
        setSelectedActionType('purchase');
      }
    }
  }, [phase, selectedActionType]);

  // 他社（NPC）のアクションログのみを抽出（ゲームログからA社, B社, C社のログをフィルタ）
  const getLatestNpcLogs = () => {
    return gameLogs.filter(log => {
      // ログ内に自分（ずっきー）以外のプレイヤー名（A社, B社, C社）が含まれているか確認
      const isNpcLog = log.includes('A社') || log.includes('B社') || log.includes('C社');
      // パスやドローなどの途中ログではなく、具体的な実行結果のログを優先
      const isActionExec = log.includes('[仕入]') || log.includes('[投入]') || 
                           log.includes('[完成]') || log.includes('[直接販売]') || 
                           log.includes('[オークション落札]') || log.includes('[機械購入]') || 
                           log.includes('[雇用]') || log.includes('[融資]') || log.includes('[借入金]') || 
                           log.includes('[研究開発]') || log.includes('[広告宣伝]') ||
                           log.includes('災害') || log.includes('故障') || log.includes('火災') ||
                           log.includes('パス');
      return isNpcLog && isActionExec;
    }).slice(0, 4); // 最新の他社意思決定結果を最大4件抽出
  };

  const npcLogs = getLatestNpcLogs();

  // オークションアリーナ起動・対戦演出
  const handleStartAuctionArena = () => {
    if (yourBidPrice <= 0 || auctionQty <= 0) return;
    
    setArenaOpen(true);
    setArenaState('thinking');
    setRevealedCounts(0);
    playActionSound();

    const bids = { 0: Number(yourBidPrice) };
    players.forEach((p) => {
      if (p.isNpc) {
        const npcData = p.periods[p.currentPeriod];
        const npcRes = calculateFinancials(npcData.carryover, npcData.ledger, npcData.actuals);
        const bid = decideNpcBid(p, npcRes, p.difficulty);
        bids[p.id] = bid;
      }
    });
    setArenaBids(bids);

    let highest = -1;
    let winner = -1;
    Object.entries(bids).forEach(([idStr, price]) => {
      const id = Number(idStr);
      if (price > highest) {
        highest = price;
        winner = id;
      }
    });
    setArenaWinnerIdx(winner);
    setArenaWinnerPrice(highest);
  };

  // AIが考えてカタカタと入札額が動く演出
  useEffect(() => {
    let interval;
    if (arenaOpen && arenaState === 'thinking') {
      interval = setInterval(() => {
        setNpcThinkingValues({
          1: Math.floor(Math.random() * 15) + 15,
          2: Math.floor(Math.random() * 15) + 15,
          3: Math.floor(Math.random() * 15) + 15
        });
      }, 80);

      setTimeout(() => {
        clearInterval(interval);
        setArenaState('reveal');
        playActionSound();
      }, 2200);
    }
    return () => clearInterval(interval);
  }, [arenaOpen, arenaState]);

  // 開票時、カードを1枚ずつ反転表示させる
  useEffect(() => {
    if (arenaOpen && arenaState === 'reveal') {
      if (revealedCounts < 4) {
        const timer = setTimeout(() => {
          setRevealedCounts(prev => prev + 1);
          playActionSound();
        }, 600); 
        return () => clearTimeout(timer);
      } else {
        setTimeout(() => {
          setArenaState('done');
          if (arenaWinnerIdx === 0) {
            playFanfareSound(); 
          } else {
            playRiskConfirmSound(); 
          }
        }, 400);
      }
    }
  }, [arenaOpen, arenaState, revealedCounts]);

  const handleApplyAuctionResult = () => {
    onNpcAuction(Number(yourBidPrice), auctionQty, targetMarketId);
    setArenaOpen(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '20px', 
      height: 'auto', 
      minWidth: '1250px',
      padding: '10px 5px'
    }}>

      {/* ==================== 📢 【他社意思決定のLIVE速報ディスプレイ】(新規追加) ==================== */}
      <div 
        className="glass-card animate-pulse-neon" 
        style={{ 
          margin: 0, 
          padding: '12px 16px', 
          background: 'rgba(255, 0, 127, 0.03)', 
          border: '1.5px solid rgba(255, 0, 127, 0.35)',
          borderRadius: '12px',
          boxShadow: '0 0 15px rgba(255, 0, 127, 0.1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--color-pink)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)' }}>
            <span style={{ fontSize: '1.2rem', animation: 'spin-slow 4s infinite' }}>📢</span>
            ライバル他社 意思決定＆アクション LIVE速報
          </h4>
          <span style={{ fontSize: '0.65rem', background: 'rgba(255, 0, 127, 0.15)', color: 'var(--color-pink)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
            最新4件を掲示
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {npcLogs.length > 0 ? (
            npcLogs.map((log, idx) => {
              // どのプレイヤーのログかに基づいてカラーを分類
              let borderClr = 'rgba(255,255,255,0.08)';
              let bgClr = 'rgba(255,255,255,0.01)';
              let playerLabel = '';

              if (log.includes('A社')) {
                borderClr = 'rgba(255, 0, 127, 0.3)';
                bgClr = 'rgba(255, 0, 127, 0.02)';
                playerLabel = 'A社';
              } else if (log.includes('B社')) {
                borderClr = 'rgba(5, 255, 161, 0.3)';
                bgClr = 'rgba(5, 255, 161, 0.02)';
                playerLabel = 'B社';
              } else if (log.includes('C社')) {
                borderClr = 'rgba(255, 208, 0, 0.3)';
                bgClr = 'rgba(255, 208, 0, 0.02)';
                playerLabel = 'C社';
              }

              return (
                <div 
                  key={idx}
                  style={{
                    background: bgClr,
                    borderLeft: `3px solid ${borderClr.replace('0.3', '1')}`,
                    borderTop: `1px solid ${borderClr}`,
                    borderRight: `1px solid ${borderClr}`,
                    borderBottom: `1px solid ${borderClr}`,
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '0.75rem',
                    lineHeight: '1.4',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '52px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {log.split(' が ')[1] || log.split(' は ')[1] || log}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    <span style={{ fontWeight: '800', color: borderClr.replace('0.3', '1') }}>{playerLabel}</span>
                    <span>{idx === 0 ? 'LIVE NOW' : `${idx}手前`}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ gridColumn: 'span 4', textAlign: 'center', padding: '10px 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              💤 まだ他社の意思決定データはありません。ゲームが進行すると自動で速報が流れます。
            </div>
          )}
        </div>
      </div>
      
      {/* ==================== 【上段コモンボード】(市場マップ ✕ アクション・山札) ==================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.25fr 1fr',
        gap: '16px',
        minHeight: '290px'
      }}>
        
        {/* A. 日本全国6大都市市場 (左側) */}
        <div className="glass-card" style={{ background: 'rgba(5, 10, 25, 0.85)', border: '1px solid var(--border-light)', margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '800', margin: '0 0 12px 0', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🗺️</span> 全国6大主要都市市場 (コモンボード)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', flexGrow: 1 }}>
            {Object.values(markets).map(m => {
              const isNoMaterials = m.materials === 0;
              return (
                <div 
                  key={m.id} 
                  style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    border: `1.5px solid ${isNoMaterials ? 'rgba(255,56,56,0.4)' : 'var(--border-light)'}`, 
                    borderRadius: '10px', 
                    padding: '10px', 
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '175px',
                    boxShadow: isNoMaterials ? 'none' : '0 4px 12px rgba(0,0,0,0.25)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{m.name.replace("市場", "")}</strong>
                      {m.baseFreight > 0 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-pink)', fontWeight: '800', background: 'rgba(255, 0, 127, 0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                          +{m.baseFreight}
                        </span>
                      )}
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: '6px', marginBottom: '6px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>残数:</span>
                        <strong style={{ color: isNoMaterials ? 'var(--color-red)' : 'var(--color-green)', fontSize: '0.85rem' }}>
                          {m.materials}/{m.maxMaterials}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {Array.from({ length: m.materials }).map((_, i) => (
                          <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-green)', boxShadow: '0 0 4px var(--color-green)' }}></div>
                        ))}
                        {isNoMaterials && <span style={{ fontSize: '0.65rem', color: 'var(--color-red)', fontWeight: 'bold' }}>SOLD OUT</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '6px', fontSize: '0.7rem' }}>
                    <div style={{ maxHeight: '38px', overflowY: 'hidden', color: 'var(--text-muted)' }}>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>最新取引:</span>
                      {m.salesHistory && m.salesHistory.length > 0 ? (
                        m.salesHistory.slice(0, 1).map((h, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '500' }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '45px', color: '#fff' }}>{h.player.split(" ")[0]}</span>
                            <span style={{ color: 'var(--color-yellow)' }}>{h.qty}@¥{h.price}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.65rem', fontStyle: 'italic' }}>履歴なし</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* B. 山札 ✕ カードドロー・処理 (右側) */}
        <div className="glass-card" style={{ border: `2.5px solid ${activePlayer.color}`, background: 'rgba(10, 15, 30, 0.95)', margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px', height: '100%', alignItems: 'center' }}>
            
            {/* 左カラム: 山札ドローボタン */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', borderRight: '1px solid var(--border-light)', paddingRight: '16px', height: '100%', justifyContent: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                山札残高: <strong style={{ color: '#fff', fontSize: '1rem' }}>{deckLength}</strong> 枚<br />
                現在のターン: <strong style={{ color: 'var(--color-cyan)', fontSize: '1rem' }}>{commonTurn}T</strong>
              </div>

              <div 
                onClick={phase === 'draw' ? onDrawCard : null}
                style={{ 
                  width: '100%', 
                  height: '140px', 
                  borderRadius: '12px', 
                  background: phase === 'draw' 
                    ? `linear-gradient(135deg, ${activePlayer.color}25, #0c102b)` 
                    : 'rgba(255,255,255,0.01)', 
                  border: `2px dashed ${phase === 'draw' ? activePlayer.color : 'var(--border-light)'}`,
                  boxShadow: phase === 'draw' ? `0 0 15px ${activePlayer.color}35` : 'none',
                  cursor: phase === 'draw' ? 'pointer' : 'default',
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '12px',
                  transition: 'all 0.3s ease'
                }}
              >
                {phase === 'draw' ? (
                  <>
                    <span style={{ fontSize: '2.5rem', marginBottom: '6px', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' }}>🎴</span>
                    <strong style={{ fontSize: '1rem', color: '#fff' }}>カードをドロー</strong>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                      クリックして引く
                    </span>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '6px' }}>🔒</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>手番アクション中</span>
                  </div>
                )}
              </div>
            </div>

            {/* 右カラム: 引いたカードと意思決定/リスク処理 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              
              {/* 1. ルールBフェーズまたはカードアクションフェーズ */}
              {(phase === 'ruleB' || (phase !== 'draw' && currentCard)) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* ヘッダーカード情報 */}
                  {phase === 'ruleB' ? (
                    <div 
                      className="glass-card animate-pulse-neon" 
                      style={{ 
                        margin: 0, 
                        padding: '12px 16px', 
                        background: 'rgba(0, 242, 254, 0.05)', 
                        border: '1.5px solid var(--color-cyan)',
                        borderRadius: '10px',
                        boxShadow: '0 0 15px rgba(0, 242, 254, 0.15)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--color-cyan)', fontFamily: 'var(--font-display)' }}>
                          <span style={{ fontSize: '1.3rem' }}>🔵</span> ルールB: 手番前アクション
                        </h4>
                        <span className="logo-badge" style={{ background: 'var(--color-cyan)', color: '#000', fontSize: '0.75rem', fontWeight: '900', padding: '3px 8px', borderRadius: '4px' }}>
                          手番: {activePlayer.name.split(" ")[0]}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                        カードを引く前に、機械購入・雇用・製造・借入金などの投資アクションを何回でも実行できます。
                      </p>
                    </div>
                  ) : (
                    <div style={{ background: `linear-gradient(135deg, ${currentCard.color}15, rgba(10,12,22,0.95))`, border: `1.5px solid ${currentCard.color}77`, borderRadius: '10px', padding: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                          <span style={{ fontSize: '1.3rem' }}>{currentCard.icon}</span> {currentCard.title}
                        </h4>
                        <span className="logo-badge" style={{ background: currentCard.color, color: '#000', fontSize: '0.75rem', fontWeight: '900', padding: '3px 8px', borderRadius: '4px' }}>
                          手番: {activePlayer.name.split(" ")[0]}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                        {currentCard.description}
                      </p>
                    </div>
                  )}

                  {/* アクション実行パネル */}
                  {(phase === 'action' || phase === 'ruleB') && (
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-light)', padding: '12px', borderRadius: '8px' }}>
                      
                      {/* A. ライバルAI (NPC) の手番の場合 */}
                      {activePlayer.isNpc ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                          <div>
                            <span style={{ fontSize: '0.9rem', display: 'block', fontWeight: 'bold', color: 'var(--color-yellow)' }}>
                              {phase === 'ruleB' ? '🤖 AIが手番前アクションを実行中...' : '🤖 AIライバルが思考しています...'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ({activePlayer.difficulty.toUpperCase()} 経営AIモデル)
                            </span>
                          </div>
                          <button className="btn btn-primary" onClick={onNpcPlay} style={{ padding: '0 16px', height: '38px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            {phase === 'ruleB' ? 'AIのルールBを実行 ➡️' : 'AIのアクションを実行する ➡️'}
                          </button>
                        </div>
                      ) : (
                        
                        // B. あなた（ずっきー）の手番の場合
                        <div>
                          
                          {/* B-1. リスクカードを引いた場合 ➔ 多段階ドロー！ */}
                          {phase === 'action' && currentCard.category === CARD_CATEGORIES.RISK ? (
                            activeRiskEvent ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ background: 'rgba(255, 56, 56, 0.08)', border: '1.5px solid rgba(255, 56, 56, 0.3)', padding: '10px', borderRadius: '8px' }}>
                                  <strong style={{ color: 'var(--color-red)', fontSize: '0.95rem', display: 'block', marginBottom: '4px' }}>
                                    💥 発生：{activeRiskEvent.title}
                                  </strong>
                                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                                    {activeRiskEvent.description}
                                  </p>
                                </div>
                                <button 
                                  className="btn btn-danger"
                                  onClick={() => onExecuteAction(activeRiskEvent.actionType, {})}
                                  style={{ alignSelf: 'start', fontSize: '0.85rem', padding: '6px 16px', fontWeight: 'bold' }}
                                >
                                  この偶発リスクを適用する 💥
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', padding: '14px', background: 'rgba(255,56,56,0.03)', border: '1.5px dashed rgba(255,56,56,0.4)', borderRadius: '8px' }}>
                                <span style={{ fontSize: '2.5rem', animation: 'bounce 2s infinite' }}>🎲</span>
                                <strong style={{ color: 'var(--color-red)', fontSize: '0.95rem' }}>偶発リスクイベントが伏せられています</strong>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0', textAlign: 'center', lineHeight: '1.4' }}>
                                  ボタンを押して、具体的災害・リスクイベントをドローしてください！
                                </p>
                                <button 
                                  className="btn btn-danger animate-pulse"
                                  onClick={onDrawRiskEvent}
                                  style={{ 
                                    fontWeight: 'bold', 
                                    fontSize: '0.85rem', 
                                    padding: '8px 24px',
                                    boxShadow: '0 0 15px rgba(255, 56, 56, 0.5)',
                                    background: 'var(--color-red)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  🎰 リスクイベントをドローする！
                                </button>
                              </div>
                            )
                          ) : (
                            
                            // B-2. 意思決定（Decision）またはルールBアクションの場合
                            <div>
                              <div style={{ marginBottom: '12px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: '700' }}>
                                  💡 {phase === 'ruleB' ? '手番前アクションを選択してください (任意):' : '意思決定アクションを選択してください:'}
                                </span>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                  {phase === 'ruleB' ? (
                                    // ルールB（手番前・任意アクション）
                                    [
                                      { type: 'buy_chip', label: '🟡チップ購入(ソ/ス/セ)' },
                                      { type: 'transfer_worker', label: '🔄配置転換(ソ)' },
                                      { type: 'sell_machine', label: '💸機械売却(イ)' },
                                      { type: 'loan', label: '🏦銀行借入(オ)' },
                                      { type: 'repay', label: '🏦借入返済(ナ)' }
                                    ].map(act => (
                                      <button 
                                        key={act.type}
                                        onClick={() => setSelectedActionType(act.type)} 
                                        className={`btn ${selectedActionType === act.type ? 'btn-primary' : ''}`}
                                        style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 'bold', borderRadius: '6px' }}
                                      >
                                        {act.label}
                                      </button>
                                    ))
                                  ) : (
                                    // ルールA（ドロー後・1回のみアクション）
                                    [
                                      { type: 'purchase', label: '📥材料購入(ツ)' },
                                      { type: 'buy_machine', label: '🏗️設備投資(ケ)' },
                                      { type: 'produce', label: '⚙️製造(コサ)' },
                                      { type: 'hire', label: '👤採用(ソ)' },
                                      { type: 'rd', label: '🔬研究開発(チ)' },
                                      { type: 'ad', label: '📢広告(セ)' },
                                      { type: 'sale_direct', label: '💰直販(キ)' },
                                      { type: 'sale_auction', label: '⚔️競合(ネ)' }
                                    ].map(act => (
                                      <button 
                                        key={act.type}
                                        onClick={() => setSelectedActionType(act.type)} 
                                        className={`btn ${selectedActionType === act.type ? 'btn-primary' : ''}`}
                                        style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 'bold', borderRadius: '6px' }}
                                      >
                                        {act.label}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>

                              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                                
                                {selectedActionType === 'purchase' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                                    
                                    {/* 動的仕入能力ステータスバー */}
                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        ⚙️ あなたの生産能力: <strong>{prodCapacity}</strong> (大:{myMachines.large}台/小:{myMachines.small}台)
                                      </span>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: totalPurchaseQty > maxAllowedQty ? 'var(--color-red)' : 'var(--color-green)' }}>
                                        仕入数量: <strong>{totalPurchaseQty}</strong> / 最大 <strong>{maxAllowedQty}</strong> 個 (生産能力の2倍まで)
                                      </span>
                                    </div>

                                    {/* 6市場並列仕入数量カウンター */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                      {Object.values(markets).map(m => {
                                        const qty = purchaseQuantities[m.id] || 0;
                                        const freight = m.baseFreight || 0;
                                        return (
                                          <div 
                                            key={m.id} 
                                            style={{ 
                                              background: 'rgba(255,255,255,0.01)', 
                                              border: '1px solid var(--border-light)', 
                                              borderRadius: '6px', 
                                              padding: '6px 10px',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center'
                                            }}
                                          >
                                            <div>
                                              <strong style={{ fontSize: '0.8rem', display: 'block', color: '#fff' }}>{m.name.replace("市場", "")}</strong>
                                              <span style={{ fontSize: '0.65rem', color: freight > 0 ? 'var(--color-pink)' : 'var(--text-muted)' }}>
                                                {freight > 0 ? `送料 ¥${freight}万/個` : "送料無料"} (残{m.materials})
                                              </span>
                                            </div>
                                            <input 
                                              type="number" 
                                              className="form-input" 
                                              style={{ 
                                                width: '60px', 
                                                fontSize: '0.85rem', 
                                                padding: '4px 6px', 
                                                textAlign: 'center', 
                                                background: qty > 0 ? 'rgba(5, 255, 161, 0.08)' : 'rgba(255,255,255,0.01)',
                                                border: qty > 0 ? '1px solid var(--color-green)' : '1px solid var(--border-light)',
                                                color: qty > 0 ? 'var(--color-green)' : '#fff'
                                              }}
                                              min="0"
                                              max={m.materials}
                                              value={qty}
                                              onChange={(e) => handleUpdatePurchaseQty(m.id, e.target.value)}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* 支払額シミュレーター & 確定ボタン */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--border-light)', paddingTop: '10px', marginTop: '4px' }}>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        材料費: ¥{totalPurchaseQty}万 + 
                                        送料: ¥{Object.entries(purchaseQuantities).reduce((sum, [id, q]) => sum + (markets[id]?.baseFreight || 0) * q, 0)}万 
                                        ➔ <strong style={{ color: 'var(--color-yellow)', fontSize: '0.85rem' }}>支払総額: ¥{totalPurchaseQty + Object.entries(purchaseQuantities).reduce((sum, [id, q]) => sum + (markets[id]?.baseFreight || 0) * q, 0)}万</strong>
                                      </div>
                                      <button 
                                        className="btn btn-primary animate-pulse-neon"
                                        style={{ fontSize: '0.85rem', padding: '6px 20px', fontWeight: 'bold', height: '34px' }}
                                        onClick={() => {
                                          onExecuteAction("purchase", { purchases: purchaseQuantities, price: 1 });
                                          setPurchaseQuantities({ sapporo: 0, sendai: 0, tokyo: 0, nagoya: 0, osaka: 0, fukuoka: 0 });
                                        }}
                                        disabled={totalPurchaseQty <= 0}
                                      >
                                        仕入一括確定 📥
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {selectedActionType === 'produce' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        <input type="radio" name="prodType" checked={produceType === 'input'} onChange={() => { setProduceType('input'); setProduceQty(1); }} />
                                        投入 (コ)
                                      </label>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        <input type="radio" name="prodType" checked={produceType === 'complete'} onChange={() => { setProduceType('complete'); setProduceQty(1); }} />
                                        完成 (サ - ¥10万/個)
                                      </label>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                                      <div className="form-group" style={{ width: '120px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                          数量 (最大 {prodCapacity}個)
                                        </label>
                                        <input 
                                          type="number" 
                                          className="form-input" 
                                          style={{ fontSize: '0.85rem', padding: '6px' }}
                                          min="1" 
                                          max={prodCapacity}
                                          value={produceQty}
                                          onChange={(e) => setProduceQty(Math.min(prodCapacity, Math.max(1, Number(e.target.value))))}
                                        />
                                      </div>
                                      <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("produce", { type: produceType, qty: produceQty })}>
                                        製造開始 ⚙️
                                      </button>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                      ※ 最大能力: {prodCapacity}個 (ワーカー:{myWorkersProd}人, 大型:{myMachines.large}台, 小型:{myMachines.small}台, アタッチ:{myMachines.attachments || 0}個)
                                    </div>
                                  </div>
                                )}

                                {selectedActionType === 'sale_direct' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '140px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>販売先市場</label>
                                      <select 
                                        className="form-select" 
                                        style={{ fontSize: '0.85rem', padding: '6px' }}
                                        value={targetMarketId}
                                        onChange={(e) => setTargetMarketId(e.target.value)}
                                      >
                                        {Object.values(markets).map(m => (
                                          <option key={m.id} value={m.id}>{m.name.replace("市場", "")} (運:+{m.baseFreight})</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="form-group" style={{ width: '90px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>単価(万)</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.85rem', padding: '6px' }} value={directSalePrice} onChange={(e) => setDirectSalePrice(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <div className="form-group" style={{ width: '80px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>数量</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.85rem', padding: '6px' }} value={directSaleQty} min="1" onChange={(e) => setDirectSaleQty(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("sale_direct", { price: directSalePrice, qty: directSaleQty, marketId: targetMarketId })}>
                                      直販確定 💰
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'sale_auction' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '130px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>開催市場</label>
                                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '6px' }} value={targetMarketId} onChange={(e) => setTargetMarketId(e.target.value)}>
                                        {Object.values(markets).map(m => (
                                          <option key={m.id} value={m.id}>{m.name.replace("市場", "")}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="form-group" style={{ width: '70px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>数量</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.85rem', padding: '6px' }} value={auctionQty} onChange={(e) => setAuctionQty(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <div className="form-group" style={{ width: '80px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>入札額</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.85rem', padding: '6px' }} value={yourBidPrice} onChange={(e) => setYourBidPrice(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <button 
                                      className="btn btn-primary animate-pulse" 
                                      style={{ fontSize: '0.85rem', padding: '7px 20px', background: 'var(--color-pink)', border: 'none', fontWeight: 'bold', height: '36px', color: '#fff', cursor: 'pointer' }} 
                                      onClick={handleStartAuctionArena}
                                    >
                                      アリーナ入札 ⚔️
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'buy_machine' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                                    <div className="form-group" style={{ width: '220px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>機械タイプ</label>
                                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '6px' }} value={machineType} onChange={(e) => setMachineType(e.target.value)}>
                                        <option value="small">小型機械 (¥100万)</option>
                                        <option value="large">大型機械 (¥200万)</option>
                                        <option value="attachment">アタッチメント (¥20万)</option>
                                      </select>
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("buy_machine", { type: machineType })}>
                                      購入 🏗️
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'hire' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                                    <div className="form-group" style={{ width: '180px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>雇用職種 (採用費: ¥5万 / 科目ソ)</label>
                                      <select 
                                        className="form-select" 
                                        style={{ fontSize: '0.85rem', padding: '6px' }} 
                                        value={hireType} 
                                        onChange={(e) => setHireType(e.target.value)}
                                      >
                                        <option value="prod">⚙️ ワーカー (工場生産職人)</option>
                                        <option value="sales">💼 セールスマン (市場営業員)</option>
                                      </select>
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("hire", { type: hireType })}>
                                      雇用実行 👤
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'loan' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '120px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>借入金額(万円)</label>
                                      <input 
                                        type="number" 
                                        className="form-input" 
                                        style={{ fontSize: '0.85rem', padding: '6px' }} 
                                        value={loanAmount} 
                                        step="10"
                                        onChange={(e) => setLoanAmount(Math.max(10, Number(e.target.value)))} 
                                      />
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("loan", { amount: loanAmount })}>
                                      借入実行 🏦
                                    </button>
                                    <div style={{ width: '100%', fontSize: '0.7rem', color: 'var(--color-yellow)', marginTop: '4px', lineHeight: '1.4' }}>
                                      ※ 借入実行時に金利即時支払 (2〜3期目10% / 4期目以降5%) が発生し「タ」に即時計上されます。<br />
                                      ※ さらに毎期の期末決算時にも、借入金残高に対する当期金利が自動的に発生します。
                                    </div>
                                  </div>
                                )}

                                {selectedActionType === 'rd' && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>研究開発費 ¥20万を支払い、研究開発チップ(レベル)を+1 (科目「チ」)</span>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("rd", {})}>
                                      研究開発実行 🔬
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'ad' && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>広告宣伝費 ¥10万を支払い、広告チップを+1 (科目「セ」)</span>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("ad", {})}>
                                      広告宣伝費支払 📢
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'buy_chip' && (() => {
                                  const chipsList = [
                                    { id: 'insurance', label: '🛡️ 保険 (黄)', price: 5, category: '一般管理費ソ', has: activePlayer.hasInsurance, desc: '火災時に16万、盗難時に10万の保険金を受領し、チップは消費されます' },
                                    { id: 'pac', label: '🟢 PAC生産性 (緑)', price: 10, category: '製造経費ス', has: activePlayer.hasPac, desc: '工場稼働時に「稼働機械総数 × 1」個生産能力がプラスされます（1枚制限）' },
                                    { id: 'merchandiser', label: '🟢 マーチャンダイザー (緑)', price: 10, category: '一般管理費ソ', has: activePlayer.hasMerchandiser, desc: '入札競争時に優先落札されます（1枚制限）' },
                                    { id: 'research', label: '🟢 マーケットリサーチ (緑)', price: 10, category: '販売費セ', has: activePlayer.hasResearch, desc: 'オークション落札時に単価が+2万ブーストされます（1枚制限）' }
                                  ];

                                  const handleToggleChip = (cid) => {
                                    setSelectedChips(prev => 
                                      prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]
                                    );
                                  };

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
                                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 'bold' }}>
                                        🟡 チップの一括一斉購入 (購入するチップにチェックを入れてください):
                                      </span>
                                      
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', width: '100%' }}>
                                        {chipsList.map(chip => (
                                          <div 
                                            key={chip.id} 
                                            onClick={() => !chip.has && handleToggleChip(chip.id)}
                                            style={{
                                              background: chip.has ? 'rgba(255,255,255,0.02)' : selectedChips.includes(chip.id) ? 'rgba(0, 242, 254, 0.08)' : 'rgba(0,0,0,0.2)',
                                              border: chip.has ? '1px solid rgba(255,255,255,0.05)' : selectedChips.includes(chip.id) ? '1px solid var(--color-cyan)' : '1px solid rgba(255,255,255,0.08)',
                                              padding: '12px',
                                              borderRadius: '8px',
                                              cursor: chip.has ? 'not-allowed' : 'pointer',
                                              display: 'flex',
                                              gap: '10px',
                                              alignItems: 'start',
                                              transition: 'all 0.2s',
                                              opacity: chip.has ? 0.6 : 1
                                            }}
                                          >
                                            <input 
                                              type="checkbox" 
                                              checked={chip.has || selectedChips.includes(chip.id)}
                                              disabled={chip.has}
                                              onChange={() => {}} // 親divのクリックでハンドリング
                                              style={{ marginTop: '3px', cursor: chip.has ? 'not-allowed' : 'pointer' }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong style={{ fontSize: '0.8rem', color: chip.has ? 'var(--text-muted)' : '#fff' }}>{chip.label}</strong>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--color-yellow)', fontWeight: 'bold' }}>
                                                  {chip.has ? '所有中' : `¥${chip.price}万`}
                                                </span>
                                              </div>
                                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>{chip.desc}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginTop: '5px', borderTop: '1px dashed var(--border-light)', paddingTop: '10px' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                          合計購入額: <strong style={{ color: 'var(--color-cyan)', fontSize: '0.88rem' }}>
                                            ¥{selectedChips.reduce((sum, cid) => sum + (chipsList.find(c => c.id === cid)?.price || 0), 0)}万
                                          </strong>
                                        </span>
                                        <button 
                                          className="btn btn-primary" 
                                          disabled={selectedChips.length === 0}
                                          onClick={() => {
                                            onExecuteAction("buy_chip", { chipTypes: selectedChips });
                                            setSelectedChips([]);
                                          }}
                                          style={{ fontSize: '0.82rem', padding: '6px 16px', fontWeight: 'bold' }}
                                        >
                                          🛒 選択したチップを一斉購入する
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {selectedActionType === 'transfer_worker' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                                    <div className="form-group" style={{ width: '240px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>配置転換先 (研修費: ¥5万 / 一般管理費ソ)</label>
                                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '6px' }} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                                        <option value="prod">⚙️ ワーカー (工場生産職) へ転換</option>
                                        <option value="sales">💼 セールスマン (営業職) へ転換</option>
                                      </select>
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("transfer_worker", { type: transferTo })}>
                                      配置転換実行 🔄
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'sell_machine' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '220px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>売却する機械 (購入額の半額回収 / 科目イ)</label>
                                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '6px' }} value={sellMachineType} onChange={(e) => setSellMachineType(e.target.value)}>
                                        <option value="small">小型機械 (¥50万回収)</option>
                                        <option value="large">大型機械 (¥100万回収)</option>
                                        <option value="attachment">アタッチメント (¥10万回収)</option>
                                      </select>
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => {
                                      if (confirm("本当に機械を売却しますか？ (工場に機械がゼロになる売却はできません)")) {
                                        onExecuteAction("sell_machine", { machineType: sellMachineType });
                                      }
                                    }}>
                                      機械売却 💸
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'repay' && (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                                    <div className="form-group" style={{ width: '150px' }}>
                                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>返済額 (万円 / 科目ナ)</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.85rem', padding: '6px' }} value={repayAmount} step="10" onChange={(e) => setRepayAmount(Math.max(10, Number(e.target.value)))} />
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '7px 16px', fontWeight: 'bold', height: '36px' }} onClick={() => onExecuteAction("repay", { amount: repayAmount })}>
                                      返済実行 🏦
                                    </button>
                                  </div>
                                )}

                              </div>

                              {/* ルールBフェーズ中のみ表示されるドロー移行ボタン */}
                              {phase === 'ruleB' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1.5px solid var(--border-light)', paddingTop: '12px', marginTop: '12px' }}>
                                  <button 
                                    className="btn animate-pulse-neon" 
                                    style={{ 
                                      fontSize: '0.85rem', 
                                      padding: '8px 24px', 
                                      background: 'var(--color-pink)', 
                                      color: '#000', 
                                      fontWeight: '900', 
                                      borderRadius: '6px',
                                      boxShadow: '0 0 15px rgba(255, 0, 127, 0.4)',
                                      border: 'none',
                                      cursor: 'pointer'
                                    }} 
                                    onClick={onEndRuleB}
                                  >
                                    🃏 意思決定カードを引くへ進む ➡️
                                  </button>
                                </div>
                              )}

                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  )}

                  {/* ターン終了待ち */}
                  {phase === 'resolved' && (
                    <div style={{ background: 'rgba(5, 255, 161, 0.04)', border: '1.5px solid rgba(5, 255, 161, 0.25)', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--color-green)' }}>
                        ✔️ アクション完了！帳簿に仕訳が記帳されました。
                      </span>
                      <button className="btn btn-primary animate-pulse-neon" onClick={onEndTurn} style={{ fontSize: '0.85rem', padding: '6px 18px', background: 'var(--color-cyan)', color: '#000', border: 'none', fontWeight: '800', borderRadius: '5px' }}>
                        次の手番へ ➡️
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '150px', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎲</span>
                  <h4 style={{ fontWeight: '800', fontSize: '1.1rem', color: '#fff', margin: 0 }}>現在の手番: {activePlayer.name.split(" ")[0]}</h4>
                  <p style={{ fontSize: '0.8rem', marginTop: '6px', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '300px', lineHeight: '1.4' }}>
                    {activePlayer.isNpc 
                      ? "「カードをドロー」をタップして、ライバルAIに山札を引かせてください。" 
                      : "左側の山札をタップして、意思決定またはリスクカードを引いてください！"}
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ==================== 【下段4社並列工場盤】(横並び1x4グリッド・大画面表示) ==================== */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px',
        marginTop: '10px'
      }}>
        <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '800', margin: '0 0 4px 0', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏭</span> 各プレイヤーの会社盤 ✕ 物理在庫ストッカー (4社横並びビュー)
        </h4>

        {/* 1x4 グリッド：横幅全体を最大限に活用し、個々のボードを大きく表示！ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {players.map((p, idx) => {
            const pPeriod = p.currentPeriod;
            const pData = p.periods[pPeriod];
            const pRes = calculateFinancials(pData.carryover, pData.ledger, pData.actuals);
            const isSelf = p.id === 0;
            const isActive = p.id === activePlayerIdx;

            return (
              <div 
                key={p.id} 
                className="glass-card" 
                style={{ 
                  margin: 0, 
                  padding: '16px',
                  border: isActive ? `3px solid ${p.color}` : '1.5px solid var(--border-light)',
                  boxShadow: isActive ? `0 0 20px ${p.color}25` : 'none',
                  background: isSelf ? 'rgba(0, 242, 254, 0.03)' : 'rgba(10, 15, 30, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  transition: 'all 0.3s ease',
                  minHeight: '390px'
                }}
              >
                {/* プレイヤーヘッダー情報 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-light)', paddingBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div 
                      className={isActive ? "animate-pulse" : ""}
                      style={{ 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        background: p.color,
                        boxShadow: isActive ? `0 0 10px ${p.color}` : 'none'
                      }}
                    ></div>
                    <strong style={{ fontSize: '0.95rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                      {p.name.replace(" (あなた)", "").replace(" (ライバル/初級)", "").replace(" (ライバル/中級)", "").replace(" (ライバル/上級)", "")}
                    </strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: '900', color: 'var(--color-cyan)', background: 'rgba(0, 242, 254, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                    現預金: ¥{pRes.bookEndingCash}万
                  </span>
                </div>

                {/* 資金、自己資本、人員、研究開発、および公式ジュニア能力パラメータ */}
                {(() => {
                  let pProdCount = pData.carryover.workersProd !== undefined ? pData.carryover.workersProd : 2;
                  let pSalesCount = pData.carryover.workersSales !== undefined ? pData.carryover.workersSales : 1;
                  (pData.ledger || []).forEach(e => {
                    if (e.category === 'ソ' && e.memo?.includes('新規採用（ワーカー）')) pProdCount += (Number(e.quantity) || 0);
                    if (e.category === 'ソ' && e.memo?.includes('新規採用（セールスマン）')) pSalesCount += (Number(e.quantity) || 0);
                    if (e.category === 'ソ' && e.memo?.includes('配置転換（ワーカーに移動）')) {
                      pProdCount += (Number(e.quantity) || 0);
                      pSalesCount -= (Number(e.quantity) || 0);
                    }
                    if (e.category === 'ソ' && e.memo?.includes('配置転換（セールスマンに移動）')) {
                      pProdCount -= (Number(e.quantity) || 0);
                      pSalesCount += (Number(e.quantity) || 0);
                    }
                  });
                  
                  // 生産能力計算
                  const pActiveLarge = Math.min(pRes.machines.large || 0, pProdCount);
                  const pActiveSmall = Math.min(pRes.machines.small || 0, Math.max(0, pProdCount - pActiveLarge));
                  const pActiveAttach = Math.min(pRes.machines.attachments || 0, pActiveSmall);
                  const pBaseCap = (pActiveLarge * 4) + (pActiveSmall * 1) + pActiveAttach;
                  const pPacBoost = p.hasPac ? (pActiveLarge + pActiveSmall) : 0;
                  const pProdCap = pBaseCap + pPacBoost;

                  // 販売能力計算
                  const pMaxAdLimit = pSalesCount * 2;
                  const pEffectiveAd = Math.min(p.adLevel || 0, pMaxAdLimit);
                  const pSalesCap = (pSalesCount * 2) + (pEffectiveAd * 2);

                  // 競争力補正値
                  const parentId = (turnOrder && turnOrder[orderIndex] !== undefined) ? turnOrder[orderIndex] : activePlayerIdx;
                  const pIsParent = p.id === parentId;
                  const pPriceAdv = (pIsParent ? 2 : 0) + ((p.rdLevel || 0) * 2);

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '6px' }}>
                      <div>
                        自己資本: <strong style={{ color: 'var(--color-yellow)', fontSize: '0.82rem' }}>¥{pRes.bs.totalNetAssets}万</strong>
                      </div>
                      <div>
                        社員数: <strong style={{ color: '#fff' }}>{pProdCount + pSalesCount} 名</strong>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                          (⚙️{pProdCount}/💼{pSalesCount})
                        </span>
                      </div>
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        機械設備: <strong style={{ color: 'var(--color-purple)' }}>大{pRes.machines.large}/小{pRes.machines.small}/ア{pRes.machines.attachments}</strong>
                      </div>
                      <div>
                        生産力: <strong style={{ color: 'var(--color-green)' }}>{pProdCap}個/月</strong>
                      </div>
                      <div>
                        販売力: <strong style={{ color: 'var(--color-pink)' }}>{pSalesCap}個/月</strong>
                      </div>
                      <div>
                        競争アド: <strong style={{ color: 'var(--color-cyan)' }}>-{pPriceAdv}万</strong>
                      </div>
                      
                      {/* チップ所持状況バッジ */}
                      <div style={{ gridColumn: 'span 2', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.06)', paddingTop: '4px' }}>
                        {p.hasInsurance && <span style={{ fontSize: '0.65rem', background: '#ffd000', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>🛡️ 保険(黄)</span>}
                        {p.hasPac && <span style={{ fontSize: '0.65rem', background: '#05ffa1', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>🟢 PAC(緑)</span>}
                        {p.hasMerchandiser && <span style={{ fontSize: '0.65rem', background: '#05ffa1', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>🟢 マーチャン(緑)</span>}
                        {p.hasResearch && <span style={{ fontSize: '0.65rem', background: '#05ffa1', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>🟢 マケリサ(緑)</span>}
                        {!p.hasInsurance && !p.hasPac && !p.hasMerchandiser && !p.hasResearch && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>所持チップなし</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* 在庫ストッカー棚 (物理的ビジュアル表示) - 縦幅と丸の大きさを大幅スケールアップ！ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', flexGrow: 1 }}>
                  
                  {/* 材料 */}
                  <div style={{ background: 'rgba(5, 255, 161, 0.03)', border: '1px solid rgba(5, 255, 161, 0.15)', padding: '6px', borderRadius: '8px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-green)', fontWeight: '800', borderBottom: '1px solid rgba(5, 255, 161, 0.1)', paddingBottom: '2px' }}>①材料</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', margin: '4px 0', alignContent: 'flex-start', flexGrow: 1 }}>
                      {Array.from({ length: Math.max(0, Math.floor(pRes.mat.endingCount || 0)) }).map((_, i) => (
                        <div key={i} style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--color-green)', boxShadow: '0 0 3px var(--color-green)' }}></div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px dashed rgba(5, 255, 161, 0.1)', paddingTop: '2px' }}>
                      <span style={{ fontWeight: 'bold', color: '#fff' }}>{Math.max(0, pRes.mat.endingCount || 0)} 個</span>
                      <span style={{ color: 'var(--color-cyan)' }}>¥{pRes.mat.unitCost ? pRes.mat.unitCost.toFixed(0) : 0}</span>
                    </div>
                  </div>

                  {/* 仕掛品 */}
                  <div style={{ background: 'rgba(155, 81, 224, 0.03)', border: '1px solid rgba(155, 81, 224, 0.15)', padding: '6px', borderRadius: '8px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-purple)', fontWeight: '800', borderBottom: '1px solid rgba(155, 81, 224, 0.1)', paddingBottom: '2px' }}>②仕掛</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', margin: '4px 0', alignContent: 'flex-start', flexGrow: 1 }}>
                      {Array.from({ length: Math.max(0, Math.floor(pRes.wip.endingCount || 0)) }).map((_, i) => (
                        <div key={i} style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--color-purple)', boxShadow: '0 0 3px var(--color-purple)' }}></div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px dashed rgba(155, 81, 224, 0.1)', paddingTop: '2px' }}>
                      <span style={{ fontWeight: 'bold', color: '#fff' }}>{Math.max(0, pRes.wip.endingCount || 0)} 個</span>
                      <span style={{ color: 'var(--color-cyan)' }}>¥{pRes.wip.unitCost ? pRes.wip.unitCost.toFixed(0) : 0}</span>
                    </div>
                  </div>

                  {/* 製品 */}
                  <div style={{ background: 'rgba(255, 0, 127, 0.03)', border: '1px solid rgba(255, 0, 127, 0.15)', padding: '6px', borderRadius: '8px', minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-pink)', fontWeight: '800', borderBottom: '1px solid rgba(255, 0, 127, 0.1)', paddingBottom: '2px' }}>③製品</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', margin: '4px 0', alignContent: 'flex-start', flexGrow: 1 }}>
                      {Array.from({ length: Math.max(0, Math.floor(pRes.prod.endingCount || 0)) }).map((_, i) => (
                        <div key={i} style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--color-pink)', boxShadow: '0 0 3px var(--color-pink)' }}></div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px dashed rgba(255, 0, 127, 0.1)', paddingTop: '2px' }}>
                      <span style={{ fontWeight: 'bold', color: '#fff' }}>{Math.max(0, pRes.prod.endingCount || 0)} 個</span>
                      <span style={{ color: 'var(--color-cyan)' }}>¥{pRes.prod.unitCost ? pRes.prod.unitCost.toFixed(0) : 0}</span>
                    </div>
                  </div>

                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ==================== 🏆 特設競合入札アリーナ・モーダル ==================== */}
      {arenaOpen && (
        <div style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(5, 7, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          animation: 'fadeIn 0.3s ease'
        }}>
          
          <div style={{
            width: '650px',
            background: 'rgba(10, 15, 30, 0.95)',
            border: '2px solid var(--border-light)',
            borderRadius: '16px',
            boxShadow: '0 0 30px rgba(0, 242, 254, 0.25)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            
            {/* アリーナ・ヘッダー */}
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.8rem' }}>⚔️</span>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: 'var(--color-pink)' }}>
                    競合入札対戦アリーナ (オークション会場)
                  </h2>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    開催市場: {markets[targetMarketId]?.name || "東京"} │ 数量: {auctionQty} 個
                  </span>
                </div>
              </div>
              
              {arenaState === 'thinking' && (
                <button 
                  onClick={() => setArenaOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  キャンセル ❌
                </button>
              )}
            </div>

            {/* アリーナ・ステージ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', minHeight: '180px', alignItems: 'center' }}>
              {players.map((p, i) => {
                const isWinner = p.id === arenaWinnerIdx;
                const isNpc = p.isNpc;
                
                let displayVal = "??";
                let isRevealed = false;
                
                if (arenaState === 'thinking') {
                  displayVal = isNpc ? String(npcThinkingValues[p.id]) : String(yourBidPrice);
                  isRevealed = !isNpc;
                } else if (arenaState === 'reveal' || arenaState === 'done') {
                  isRevealed = revealedCounts > i;
                  displayVal = isRevealed ? String(arenaBids[p.id]) : "??";
                }

                const showWinnerEffect = arenaState === 'done' && isWinner;

                return (
                  <div 
                    key={p.id}
                    style={{
                      background: showWinnerEffect 
                        ? `linear-gradient(135deg, ${p.color}25, rgba(15,25,50,0.95))` 
                        : 'rgba(255,255,255,0.01)',
                      border: `2px solid ${showWinnerEffect ? p.color : isRevealed ? 'var(--border-light)' : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: '12px',
                      padding: '16px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      transform: showWinnerEffect ? 'scale(1.05)' : 'scale(1)',
                      boxShadow: showWinnerEffect ? `0 0 20px ${p.color}45` : 'none',
                      transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}
                  >
                    <div style={{ 
                      width: '40px', 
                      height: '40px', 
                      borderRadius: '50%', 
                      background: p.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      color: '#000',
                      boxShadow: showWinnerEffect ? `0 0 10px ${p.color}` : 'none'
                    }}>
                      {p.name.charAt(0)}
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <strong style={{ fontSize: '0.75rem', color: '#fff', display: 'block' }}>
                        {p.name.split(" ")[0]}
                      </strong>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                        {isNpc ? `AI (${p.difficulty.toUpperCase()})` : "あなた"}
                      </span>
                    </div>

                    <div style={{
                      background: isRevealed 
                        ? 'rgba(0,0,0,0.5)' 
                        : 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.05)',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      minHeight: '52px'
                    }}>
                      {arenaState === 'thinking' && isNpc ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span className="animate-spin-slow" style={{ fontSize: '0.8rem', color: p.color }}>⚙️</span>
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '2px' }}>入札中...</span>
                        </div>
                      ) : (
                        <>
                          <strong style={{ 
                            fontSize: isRevealed ? '1.4rem' : '1.1rem', 
                            color: showWinnerEffect ? 'var(--color-yellow)' : isRevealed ? p.color : 'rgba(255,255,255,0.2)',
                            fontFamily: 'var(--font-display)',
                            textShadow: showWinnerEffect ? `0 0 8px ${p.color}` : 'none'
                          }}>
                            {isRevealed ? `¥${displayVal}万` : "🔒"}
                          </strong>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* アリーナ・コントロールフッター */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              
              {arenaState === 'thinking' && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="animate-spin" style={{ color: 'var(--color-cyan)' }}>⌛</span>
                  <span>ライバルAIが入札額を計算中... 駆け引きが始まっています。</span>
                </div>
              )}

              {arenaState === 'reveal' && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-pink)', fontWeight: 'bold' }}>
                  🥁 ドラムロール... 順次開票中！
                </div>
              )}

              {arenaState === 'done' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  
                  <div style={{ 
                    background: 'rgba(5, 255, 161, 0.05)', 
                    border: '1px solid rgba(5, 255, 161, 0.2)', 
                    padding: '12px 24px', 
                    borderRadius: '10px', 
                    textAlign: 'center',
                    boxShadow: '0 0 15px rgba(5, 255, 161, 0.1)',
                    width: '100%'
                  }}>
                    <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '2px' }}>
                      {arenaWinnerIdx === 0 ? "🎉 【落札大成功！】" : "💥 【競り負け！】"}
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: players[arenaWinnerIdx].color }}>
                      {players[arenaWinnerIdx].name}
                    </strong>
                    <span> が単価 </span>
                    <strong style={{ color: 'white', fontSize: '1rem' }}>¥{arenaWinnerPrice}万円</strong>
                    <span> で落札しました！</span>
                  </div>

                  <button 
                    className="btn btn-primary animate-pulse-neon"
                    onClick={handleApplyAuctionResult}
                    style={{ 
                      fontSize: '0.85rem', 
                      padding: '10px 28px',
                      background: 'var(--color-cyan)',
                      color: '#000',
                      fontWeight: '800',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    アリーナ結果を確定適用して戻る ➡️
                  </button>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default DigitalBoard;
