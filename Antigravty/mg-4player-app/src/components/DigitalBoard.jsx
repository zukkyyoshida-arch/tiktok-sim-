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
  onDrawCard, 
  onDrawRiskEvent, 
  onExecuteAction, 
  onEndTurn,
  onNpcPlay,
  onNpcAuction
}) {
  const activePlayer = players[activePlayerIdx] || players[0];
  const isSelf = activePlayer.id === 0;

  // 意思決定カードの時に選択中のアクションタイプ
  const [selectedActionType, setSelectedActionType] = useState('purchase'); // purchase, produce, sale_direct, buy_machine, hire, loan, rd, ad

  // アクション用パラメータ
  const [targetMarketId, setTargetMarketId] = useState('tokyo'); 
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [produceType, setProduceType] = useState('input'); 
  const [produceQty, setProduceQty] = useState(1);
  const [directSalePrice, setDirectSalePrice] = useState(25);
  const [directSaleQty, setDirectSaleQty] = useState(1);
  const [machineType, setMachineType] = useState('small');
  const [loanAmount, setLoanAmount] = useState(50);

  // オークション入札パラメータ
  const [yourBidPrice, setYourBidPrice] = useState(26);
  const [auctionQty, setAuctionQty] = useState(2);

  // === 【アジェンダ②】オークションアリーナ特設演出用ステート ===
  const [arenaOpen, setArenaOpen] = useState(false);
  const [arenaState, setArenaState] = useState('thinking'); // thinking ➔ reveal ➔ done
  const [arenaBids, setArenaBids] = useState({});
  const [arenaWinnerIdx, setArenaWinnerIdx] = useState(-1);
  const [arenaWinnerPrice, setArenaWinnerPrice] = useState(-1);
  const [revealedCounts, setRevealedCounts] = useState(0); // 順次反転表示用
  const [npcThinkingValues, setNpcThinkingValues] = useState({ 1: 20, 2: 20, 3: 20 });

  // 最大購入可能数の計算
  const selectedMarket = markets[targetMarketId] || markets.tokyo;
  const maxPurchaseQty = Math.min(selectedMarket.materials, 6);

  // オークションアリーナ起動・対戦演出
  const handleStartAuctionArena = () => {
    if (yourBidPrice <= 0 || auctionQty <= 0) return;
    
    // アリーナを開く
    setArenaOpen(true);
    setArenaState('thinking');
    setRevealedCounts(0);
    playActionSound();

    // AIの入札を裏で事前計算
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

    // 落札者の計算
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

  // AIが考えてカタカタと入札額が動く演出エフェクト
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

      // 2.2秒後にシャッフルを止め、開票フェーズへ
      setTimeout(() => {
        clearInterval(interval);
        setArenaState('reveal');
        playActionSound();
      }, 2200);
    }
    return () => clearInterval(interval);
  }, [arenaOpen, arenaState]);

  // 開票時、カードを1枚ずつドン！ドン！と反転表示させる
  useEffect(() => {
    if (arenaOpen && arenaState === 'reveal') {
      if (revealedCounts < 4) {
        const timer = setTimeout(() => {
          setRevealedCounts(prev => prev + 1);
          playActionSound();
        }, 600); // 0.6秒間隔で反転
        return () => clearTimeout(timer);
      } else {
        // 全員反転が完了したら、結果決定音 (落札ファンファーレ)
        setTimeout(() => {
          setArenaState('done');
          if (arenaWinnerIdx === 0) {
            playFanfareSound(); // あなたの勝利！
          } else {
            playRiskConfirmSound(); // ライバルの落札
          }
        }, 400);
      }
    }
  }, [arenaOpen, arenaState, revealedCounts]);

  const handleApplyAuctionResult = () => {
    // 実際の売上アクションを親コンポーネントに反映
    onNpcAuction(Number(yourBidPrice), auctionQty, targetMarketId);
    setArenaOpen(false);
  };

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: '1.15fr 0.85fr', 
      gap: '16px', 
      height: 'calc(100vh - 120px)', 
      overflow: 'hidden' 
    }}>
      
      {/* ==================== 【左カラム】市場マップ ✕ アクション・ドロー処理 (57.5%) ==================== */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        overflowY: 'auto', 
        paddingRight: '6px',
        maxHeight: '100%'
      }}>
        
        {/* 1. 日本全国6大都市市場 ✕ コモン材料倉庫 */}
        <div className="glass-card" style={{ background: 'rgba(5, 10, 25, 0.85)', border: '1px solid var(--border-light)', marginBottom: 0, padding: '12px' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: '800', margin: '0 0 10px 0', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🗺️</span> 全国6大主要都市市場 (コモンボード)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
            {Object.values(markets).map(m => {
              const isNoMaterials = m.materials === 0;
              return (
                <div 
                  key={m.id} 
                  style={{ 
                    background: 'rgba(255,255,255,0.01)', 
                    border: `1px solid ${isNoMaterials ? 'rgba(255,56,56,0.3)' : 'var(--border-light)'}`, 
                    borderRadius: '8px', 
                    padding: '8px', 
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '110px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '0.75rem', color: '#fff' }}>{m.name.replace("市場", "")}</strong>
                      {m.baseFreight > 0 && (
                        <span style={{ fontSize: '0.55rem', color: 'var(--color-pink)', fontWeight: '700' }}>
                          運賃:+{m.baseFreight}
                        </span>
                      )}
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '4px 6px', borderRadius: '4px', marginBottom: '4px' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>残数:</span>
                        <strong style={{ color: isNoMaterials ? 'var(--color-red)' : 'var(--color-green)' }}>
                          {m.materials}/{m.maxMaterials}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {Array.from({ length: m.materials }).map((_, i) => (
                          <div key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--color-green)' }}></div>
                        ))}
                        {isNoMaterials && <span style={{ fontSize: '0.5rem', color: 'var(--color-red)' }}>空</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '4px', fontSize: '0.55rem' }}>
                    <div style={{ maxHeight: '28px', overflowY: 'hidden', color: 'var(--text-muted)' }}>
                      {m.salesHistory && m.salesHistory.length > 0 ? (
                        m.salesHistory.slice(0, 1).map((h, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '30px' }}>{h.player.split(" ")[0]}</span>
                            <span>{h.qty}個@¥{h.price}</span>
                          </div>
                        ))
                      ) : (
                        <span>履歴なし</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. 山札 ✕ 意思決定・リスクカード処理パネル */}
        <div className="glass-card" style={{ border: `2px solid ${activePlayer.color}`, background: 'rgba(10, 15, 30, 0.95)', marginBottom: 0, padding: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '16px' }}>
            
            {/* 左カラム: 山札ドローボタン */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', borderRight: '1px solid var(--border-light)', paddingRight: '12px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                山札: <strong>{deckLength}</strong> 枚 │ <strong>{commonTurn}T</strong>
              </div>

              <div 
                onClick={phase === 'draw' ? onDrawCard : null}
                style={{ 
                  width: '100%', 
                  height: '110px', 
                  borderRadius: '10px', 
                  background: phase === 'draw' 
                    ? `linear-gradient(135deg, ${activePlayer.color}15, #0c102b)` 
                    : 'rgba(255,255,255,0.01)', 
                  border: `2px dashed ${phase === 'draw' ? activePlayer.color : 'var(--border-light)'}`,
                  boxShadow: phase === 'draw' ? `0 0 10px ${activePlayer.color}15` : 'none',
                  cursor: phase === 'draw' ? 'pointer' : 'default',
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '10px',
                  transition: 'all 0.3s ease'
                }}
              >
                {phase === 'draw' ? (
                  <>
                    <span style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🎴</span>
                    <strong style={{ fontSize: '0.8rem', color: '#fff' }}>カードをドロー</strong>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>
                      タップして引く
                    </span>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '4px' }}>🔒</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>手番処理中</span>
                  </div>
                )}
              </div>
            </div>

            {/* 右カラム: 引いたカードと意思決定/リスク処理 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {phase !== 'draw' && currentCard ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  
                  {/* カード基本情報表示 */}
                  <div style={{ background: `linear-gradient(135deg, ${currentCard.color}10, rgba(10,12,22,0.95))`, border: `1px solid ${currentCard.color}66`, borderRadius: '8px', padding: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                        <span>{currentCard.icon}</span> {currentCard.title}
                      </h4>
                      <span className="logo-badge" style={{ background: currentCard.color, color: '#000', fontSize: '0.6rem', fontWeight: '800', padding: '2px 6px' }}>
                        手番: {activePlayer.name.split(" ")[0]}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                      {currentCard.description}
                    </p>
                  </div>

                  {/* アクション実行パネル */}
                  {phase === 'action' && (
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-light)', padding: '10px', borderRadius: '6px' }}>
                      
                      {/* A. ライバルAI (NPC) の手番の場合 ➔ 自動思考進行 */}
                      {activePlayer.isNpc ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', display: 'block', fontWeight: 'bold' }}>
                              🤖 AIライバルが思考しています...
                            </span>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                              ({activePlayer.difficulty.toUpperCase()} AI)
                            </span>
                          </div>
                          <button className="btn btn-primary" onClick={onNpcPlay} style={{ padding: '0 12px', height: '32px', fontSize: '0.75rem' }}>
                            AIのアクションを実行する ➡️
                          </button>
                        </div>
                      ) : (
                        
                        // B. あなた（ずっきー）の手番の場合
                        <div>
                          
                          {/* B-1. 【新コマンド機能】リスクカードを引いた場合 ➔ 多段階ドロー！ */}
                          {currentCard.category === CARD_CATEGORIES.RISK ? (
                            activeRiskEvent ? (
                              // 既にドロー（開封）した場合
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ background: 'rgba(255, 56, 56, 0.05)', border: '1px solid rgba(255, 56, 56, 0.2)', padding: '8px', borderRadius: '6px' }}>
                                  <strong style={{ color: 'var(--color-red)', fontSize: '0.8rem', display: 'block', marginBottom: '2px' }}>
                                    💥 発生：{activeRiskEvent.title}
                                  </strong>
                                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>
                                    {activeRiskEvent.description}
                                  </p>
                                </div>
                                <button 
                                  className="btn btn-danger"
                                  onClick={() => onExecuteAction(activeRiskEvent.actionType, {})}
                                  style={{ alignSelf: 'start', fontSize: '0.75rem', padding: '4px 12px' }}
                                >
                                  この偶発リスクを適用する 💥
                                </button>
                              </div>
                            ) : (
                              // まだ開封していない場合 ➔ 「リスクをドローする」コマンドボタンを表示！
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', padding: '10px', background: 'rgba(255,56,56,0.02)', border: '1px dashed rgba(255,56,56,0.3)', borderRadius: '6px' }}>
                                <span style={{ fontSize: '2rem' }}>🎲</span>
                                <strong style={{ color: 'var(--color-red)', fontSize: '0.8rem' }}>リスクカードが伏せられています</strong>
                                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: '0 0 6px 0', textAlign: 'center' }}>
                                  ボタンを押して、具体的な偶発災害・リスクイベントをドローしてください！
                                </p>
                                <button 
                                  className="btn btn-danger animate-pulse"
                                  onClick={onDrawRiskEvent}
                                  style={{ 
                                    fontWeight: 'bold', 
                                    fontSize: '0.75rem', 
                                    padding: '6px 16px',
                                    boxShadow: '0 0 10px rgba(255, 56, 56, 0.4)',
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
                            
                            // B-2. 意思決定（Decision）カードを引いた場合 ➔ 自由アクション
                            <div>
                              <div style={{ marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '700' }}>
                                  💡 意思決定アクションを選択してください:
                                </span>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {[
                                    { type: 'purchase', label: '仕入(ツ)' },
                                    { type: 'produce', label: '製造(コサ)' },
                                    { type: 'sale_direct', label: '直販(キ)' },
                                    { type: 'sale_auction', label: '競合(ネ)' },
                                    { type: 'buy_machine', label: '設備(ケ)' },
                                    { type: 'hire', label: '社員(シ)' },
                                    { type: 'loan', label: '融資(オ)' },
                                    { type: 'rd', label: '技術(チ)' },
                                    { type: 'ad', label: '広告(セ)' }
                                  ].map(act => (
                                    <button 
                                      key={act.type}
                                      onClick={() => setSelectedActionType(act.type)} 
                                      className={`btn ${selectedActionType === act.type ? 'btn-primary' : ''}`}
                                      style={{ padding: '3px 8px', fontSize: '0.65rem' }}
                                    >
                                      {act.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 各選択アクションのインプットフォーム */}
                              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                                
                                {selectedActionType === 'purchase' && (
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '120px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>仕入先市場</label>
                                      <select 
                                        className="form-select" 
                                        style={{ fontSize: '0.7rem', padding: '4px' }}
                                        value={targetMarketId}
                                        onChange={(e) => setTargetMarketId(e.target.value)}
                                      >
                                        {Object.values(markets).map(m => (
                                          <option key={m.id} value={m.id}>{m.name} (残:{m.materials})</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="form-group" style={{ width: '80px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>購入数量</label>
                                      <input 
                                        type="number" 
                                        className="form-input" 
                                        style={{ fontSize: '0.7rem', padding: '4px' }}
                                        min="1" 
                                        max={maxPurchaseQty}
                                        value={purchaseQty}
                                        onChange={(e) => setPurchaseQty(Math.min(maxPurchaseQty, Math.max(1, Number(e.target.value))))}
                                      />
                                    </div>
                                    <button 
                                      className="btn btn-primary"
                                      style={{ fontSize: '0.7rem', padding: '5px 10px' }}
                                      onClick={() => onExecuteAction("purchase", { qty: purchaseQty, price: 1, marketId: targetMarketId })}
                                      disabled={maxPurchaseQty <= 0}
                                    >
                                      仕入確定 📥
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'produce' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem' }}>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                        <input type="radio" name="prodType" checked={produceType === 'input'} onChange={() => setProduceType('input')} />
                                        投入 (コ)
                                      </label>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                        <input type="radio" name="prodType" checked={produceType === 'complete'} onChange={() => setProduceType('complete')} />
                                        完成 (サ - ¥10万/個)
                                      </label>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}>
                                      <div className="form-group" style={{ width: '80px' }}>
                                        <input 
                                          type="number" 
                                          className="form-input" 
                                          style={{ fontSize: '0.7rem', padding: '4px' }}
                                          min="1" 
                                          value={produceQty}
                                          onChange={(e) => setProduceQty(Math.max(1, Number(e.target.value)))}
                                        />
                                      </div>
                                      <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("produce", { type: produceType, qty: produceQty })}>
                                        製造開始 ⚙️
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {selectedActionType === 'sale_direct' && (
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '110px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>販売先市場</label>
                                      <select 
                                        className="form-select" 
                                        style={{ fontSize: '0.7rem', padding: '4px' }}
                                        value={targetMarketId}
                                        onChange={(e) => setTargetMarketId(e.target.value)}
                                      >
                                        {Object.values(markets).map(m => (
                                          <option key={m.id} value={m.id}>{m.name.replace("市場", "")} (運:+{m.baseFreight})</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="form-group" style={{ width: '70px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>単価(万)</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.7rem', padding: '4px' }} value={directSalePrice} onChange={(e) => setDirectSalePrice(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <div className="form-group" style={{ width: '60px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>数量</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.7rem', padding: '4px' }} value={directSaleQty} min="1" onChange={(e) => setDirectSaleQty(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("sale_direct", { price: directSalePrice, qty: directSaleQty, marketId: targetMarketId })}>
                                      直販確定 💰
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'sale_auction' && (
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ width: '100px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>開催市場</label>
                                      <select className="form-select" style={{ fontSize: '0.7rem', padding: '4px' }} value={targetMarketId} onChange={(e) => setTargetMarketId(e.target.value)}>
                                        {Object.values(markets).map(m => (
                                          <option key={m.id} value={m.id}>{m.name.replace("市場", "")}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="form-group" style={{ width: '50px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>数量</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.7rem', padding: '4px' }} value={auctionQty} onChange={(e) => setAuctionQty(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <div className="form-group" style={{ width: '60px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>入札額</label>
                                      <input type="number" className="form-input" style={{ fontSize: '0.7rem', padding: '4px' }} value={yourBidPrice} onChange={(e) => setYourBidPrice(Math.max(1, Number(e.target.value)))} />
                                    </div>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ fontSize: '0.7rem', padding: '5px 10.5px', background: 'var(--color-pink)', border: 'none', fontWeight: 'bold' }} 
                                      onClick={handleStartAuctionArena}
                                    >
                                      アリーナ入札 ⚔️
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'buy_machine' && (
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}>
                                    <div className="form-group" style={{ width: '140px' }}>
                                      <label style={{ fontSize: '0.6rem' }}>機械タイプ</label>
                                      <select className="form-select" style={{ fontSize: '0.7rem', padding: '4px' }} value={machineType} onChange={(e) => setMachineType(e.target.value)}>
                                        <option value="small">小型 (¥40万)</option>
                                        <option value="large">大型 (¥80万)</option>
                                        <option value="attachment">アタッチ (¥10万)</option>
                                      </select>
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("buy_machine", { type: machineType })}>
                                      購入 🏗️
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'hire' && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>新規社員1名雇用 (¥30万出金)</span>
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("hire", {})}>
                                      雇用実行 👤
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'loan' && (
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}>
                                    <div className="form-group" style={{ width: '100px' }}>
                                      <input type="number" className="form-input" style={{ fontSize: '0.7rem', padding: '4px' }} value={loanAmount} onChange={(e) => setLoanAmount(Math.max(10, Number(e.target.value)))} />
                                    </div>
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("loan", { amount: loanAmount })}>
                                      融資を受ける 🏦
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'rd' && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>研究開発費 ¥20万を支払い、技術を+1</span>
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("rd", {})}>
                                      研究開発実行 🔬
                                    </button>
                                  </div>
                                )}

                                {selectedActionType === 'ad' && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>広告費 ¥10万を支払い、集客力を+1</span>
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={() => onExecuteAction("ad", {})}>
                                      広告宣伝費支払 📢
                                    </button>
                                  </div>
                                )}

                              </div>
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  )}

                  {/* ターン終了待ち */}
                  {phase === 'resolved' && (
                    <div style={{ background: 'rgba(5, 255, 161, 0.03)', border: '1px solid rgba(5, 255, 161, 0.15)', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem' }}>
                        ✔️ アクション完了！仕訳完了しました。
                      </span>
                      <button className="btn btn-primary animate-pulse-neon" onClick={onEndTurn} style={{ fontSize: '0.75rem', padding: '4px 12px', background: 'var(--color-cyan)', color: '#000', border: 'none', fontWeight: 'bold' }}>
                        次の手番へ ➡️
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '110px', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🎲</span>
                  <h4 style={{ fontWeight: '700', fontSize: '0.85rem', margin: 0 }}>手番: {activePlayer.name.split(" ")[0]}</h4>
                  <p style={{ fontSize: '0.7rem', marginTop: '2px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    {activePlayer.isNpc 
                      ? "「カードをドロー」をタップして、AIに山札を引かせてください。" 
                      : "左側の山札をタップして、意思決定またはリスクカードを引いてください！"}
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ==================== 【右カラム】4社並列・工場盤 ✕ 在庫ストッカー棚 (42.5%) ==================== */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        overflowY: 'auto', 
        paddingRight: '6px',
        maxHeight: '100%'
      }}>
        <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: '800', margin: '0', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🏭</span> 4社並列工場盤 ✕ 物理在庫棚
        </h4>

        {/* 2x2 の超美麗・超コンパクトグリッド構成 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {players.map((p) => {
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
                  padding: '8px',
                  border: isActive ? `2px solid ${p.color}` : '1px solid var(--border-light)',
                  boxShadow: isActive ? `0 0 10px ${p.color}25` : 'none',
                  background: isSelf ? 'rgba(0, 242, 254, 0.01)' : 'rgba(10, 15, 30, 0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.3s ease'
                }}
              >
                {/* プレイヤー基本情報 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div 
                      className={isActive ? "animate-pulse" : ""}
                      style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: p.color,
                        boxShadow: isActive ? `0 0 8px ${p.color}` : 'none'
                      }}
                    ></div>
                    <strong style={{ fontSize: '0.75rem', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '70px' }}>
                      {p.name.replace(" (あなた)", "").replace(" (ライバル/初級)", "").replace(" (ライバル/中級)", "").replace(" (ライバル/上級)", "")}
                    </strong>
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--color-cyan)' }}>
                    ¥{pRes.bookEndingCash}万
                  </span>
                </div>

                {/* 資金、自己資本、人員、技術 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.6rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', padding: '4px', borderRadius: '4px' }}>
                  <div>
                    資本: <strong style={{ color: 'var(--color-yellow)' }}>¥{pRes.bs.totalNetAssets}万</strong>
                  </div>
                  <div>
                    社員: <strong>{pRes.workers}名</strong>
                  </div>
                  <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    設備: <strong>大{pRes.machines.large}/小{pRes.machines.small}</strong>
                  </div>
                  <div>
                    技術: <strong>L{p.rdLevel}</strong> / 広: <strong>L{p.adLevel}</strong>
                  </div>
                </div>

                {/* 在庫ストッカー棚 (物理的ビジュアル表示) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  
                  {/* 材料 */}
                  <div style={{ background: 'rgba(5, 255, 161, 0.02)', border: '1px solid rgba(5, 255, 161, 0.1)', padding: '4px', borderRadius: '6px', minHeight: '52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.5rem', color: 'var(--color-green)', fontWeight: '700' }}>①材料</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px', margin: '2px 0' }}>
                      {Array.from({ length: pRes.mat.endingCount }).map((_, i) => (
                        <div key={i} style={{ width: '5px', height: '5px', borderRadius: '1px', background: 'var(--color-green)' }}></div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                      <span><strong>{pRes.mat.endingCount}</strong>個</span>
                      <span>¥{pRes.mat.unitCost ? pRes.mat.unitCost.toFixed(0) : 0}</span>
                    </div>
                  </div>

                  {/* 仕掛品 */}
                  <div style={{ background: 'rgba(155, 81, 224, 0.02)', border: '1px solid rgba(155, 81, 224, 0.1)', padding: '4px', borderRadius: '6px', minHeight: '52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.5rem', color: 'var(--color-purple)', fontWeight: '700' }}>②仕掛</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px', margin: '2px 0' }}>
                      {Array.from({ length: pRes.wip.endingCount }).map((_, i) => (
                        <div key={i} style={{ width: '5px', height: '5px', borderRadius: '1px', background: 'var(--color-purple)' }}></div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                      <span><strong>{pRes.wip.endingCount}</strong>個</span>
                      <span>¥{pRes.wip.unitCost ? pRes.wip.unitCost.toFixed(0) : 0}</span>
                    </div>
                  </div>

                  {/* 製品 */}
                  <div style={{ background: 'rgba(255, 0, 127, 0.02)', border: '1px solid rgba(255, 0, 127, 0.1)', padding: '4px', borderRadius: '6px', minHeight: '52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.5rem', color: 'var(--color-pink)', fontWeight: '700' }}>③製品</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px', margin: '2px 0' }}>
                      {Array.from({ length: pRes.prod.endingCount }).map((_, i) => (
                        <div key={i} style={{ width: '5px', height: '5px', borderRadius: '1px', background: 'var(--color-pink)' }}></div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                      <span><strong>{pRes.prod.endingCount}</strong>個</span>
                      <span>¥{pRes.prod.unitCost ? pRes.prod.unitCost.toFixed(0) : 0}</span>
                    </div>
                  </div>

                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ==================== 🏆 【アジェンダ②】特設競合入札アリーナ・モーダル ==================== */}
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
              
              {/* キャンセルボタン (決定前のみ) */}
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

            {/* アリーナ・ステージ (4社の入札カード) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', minHeight: '180px', alignItems: 'center' }}>
              {players.map((p, i) => {
                const isWinner = p.id === arenaWinnerIdx;
                const isNpc = p.isNpc;
                
                // 表示状態の決定
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
                    {/* アバター */}
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

                    {/* 会社名 */}
                    <div style={{ textAlign: 'center' }}>
                      <strong style={{ fontSize: '0.75rem', color: '#fff', display: 'block' }}>
                        {p.name.split(" ")[0]}
                      </strong>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                        {isNpc ? `AI (${p.difficulty.toUpperCase()})` : "あなた"}
                      </span>
                    </div>

                    {/* 入札金額表示パネル */}
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
                  
                  {/* 落札アナウンス */}
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

                  {/* 確定して適用ボタン */}
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
