import React, { useState } from 'react';
import { CARD_CATEGORIES } from '../utils/cards';
import { calculateFinancials } from '../utils/calculations';

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
  onDrawRiskEvent, // 新しく追加されたリスクドローイベント
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
  const [targetMarketId, setTargetMarketId] = useState('tokyo'); // デフォルトは東京市場
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [produceType, setProduceType] = useState('input'); // input (コ), complete (サ)
  const [produceQty, setProduceQty] = useState(1);
  const [directSalePrice, setDirectSalePrice] = useState(25);
  const [directSaleQty, setDirectSaleQty] = useState(1);
  const [machineType, setMachineType] = useState('small');
  const [loanAmount, setLoanAmount] = useState(50);

  // オークション入札パラメータ
  const [yourBidPrice, setYourBidPrice] = useState(26);
  const [auctionQty, setAuctionQty] = useState(2);

  // 最大購入可能数の計算
  const selectedMarket = markets[targetMarketId] || markets.tokyo;
  const maxPurchaseQty = Math.min(selectedMarket.materials, 6);

  const handleApplyYourAuction = () => {
    if (yourBidPrice <= 0 || auctionQty <= 0) return;
    onNpcAuction(Number(yourBidPrice), auctionQty, targetMarketId);
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
                                  className="btn btn-danger"
                                  onClick={onDrawRiskEvent}
                                  style={{ 
                                    fontWeight: 'bold', 
                                    fontSize: '0.75rem', 
                                    padding: '6px 16px',
                                    boxShadow: '0 0 10px rgba(255, 56, 56, 0.3)',
                                    animation: 'pulse 1.5s infinite'
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
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '5px 10px' }} onClick={handleApplyYourAuction}>
                                      入札 ⚔️
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
                      <button className="btn btn-primary" onClick={onEndTurn} style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
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

        {/* 2x2 の超美麗・超コンパクトグリッド構成（一画面に完全集約） */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
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
                  padding: '8px',
                  border: isActive ? `2px solid ${p.color}` : '1px solid var(--border-light)',
                  boxShadow: isActive ? `0 0 8px ${p.color}15` : 'none',
                  background: isSelf ? 'rgba(0, 242, 254, 0.01)' : 'rgba(10, 15, 30, 0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                {/* プレイヤー基本情報 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }}></div>
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

    </div>
  );
}

export default DigitalBoard;
