import React, { useState } from 'react';
import { CARD_TYPES } from '../utils/cards';

function DigitalBoard({ 
  players, 
  activePlayerIdx, 
  commonPeriod, 
  commonTurn, 
  currentCard, 
  deckLength, 
  phase, // "draw", "action", "auction", "resolved"
  materialsInMarket, 
  onDrawCard, 
  onExecuteAction, 
  onEndTurn 
}) {
  const activePlayer = players[activePlayerIdx];
  
  // アクションごとのローカル状態
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [produceType, setProduceType] = useState('input'); // input (投入 コ), complete (完成 サ)
  const [produceQty, setProduceQty] = useState(1);
  const [directSalePrice, setDirectSalePrice] = useState(25); // 直接販売の初期単価
  const [directSaleQty, setDirectSaleQty] = useState(1);
  const [machineType, setMachineType] = useState('small'); // small, large, attachment
  const [loanAmount, setLoanAmount] = useState(50);

  // オークション用入札額
  const [bidPrices, setBidPrices] = useState({
    0: '',
    1: '',
    2: '',
    3: ''
  });
  const [auctionQty, setAuctionQty] = useState(2);

  // 1. 仕入能力・人員数に基づく購入上限の算出
  const maxPurchaseQty = Math.min(materialsInMarket, activePlayer.workers * 2); // 社員1人あたり2個まで、かつ市場在庫まで

  // オークション落札者決定
  const handleDetermineAuctionWinner = () => {
    let highestPrice = -1;
    let winners = [];

    Object.entries(bidPrices).forEach(([idxStr, priceStr]) => {
      const price = Number(priceStr);
      if (!isNaN(price) && priceStr !== '') {
        const idx = Number(idxStr);
        if (price > highestPrice) {
          highestPrice = price;
          winners = [idx];
        } else if (price === highestPrice) {
          winners.push(idx);
        }
      }
    });

    return { highestPrice, winners };
  };

  const { highestPrice, winners } = handleDetermineAuctionWinner();

  // アクション決定時の送信ハンドラー
  const handleCommitAction = (type, payload) => {
    onExecuteAction(type, payload);
    
    // 入札などの一時状態をリセット
    setBidPrices({ 0: '', 1: '', 2: '', 3: '' });
  };

  return (
    <div className="glass-card" style={{ border: `2px solid ${activePlayer.color}`, background: 'rgba(10, 15, 30, 0.85)' }}>
      
      {/* 盤面ヘッダー */}
      <div className="card-title-bar">
        <h3 className="card-title" style={{ color: activePlayer.color }}>
          🎲 第 {commonPeriod} 期 - 第 {commonTurn} ターン
        </h3>
        <span className="logo-badge" style={{ background: activePlayer.color, color: '#000' }}>
          手番: {activePlayer.name}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px' }}>
        
        {/* 左カラム：山札とカードドロー */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', borderRight: '1px solid var(--border-light)', paddingRight: '20px' }}>
          
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            山札の残り枚数: <strong>{deckLength}</strong> 枚
          </div>

          {/* デッキのビジュアル */}
          <div 
            onClick={phase === 'draw' ? onDrawCard : null}
            style={{ 
              width: '180px', 
              height: '260px', 
              borderRadius: '16px', 
              background: phase === 'draw' 
                ? `linear-gradient(135deg, ${activePlayer.color}, #080c1e)` 
                : 'rgba(255,255,255,0.03)', 
              border: `2px dashed ${phase === 'draw' ? activePlayer.color : 'var(--border-light)'}`,
              boxShadow: phase === 'draw' ? `0 0 20px ${activePlayer.color}33` : 'none',
              cursor: phase === 'draw' ? 'pointer' : 'default',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              textAlign: 'center',
              padding: '20px'
            }}
          >
            {phase === 'draw' ? (
              <>
                <span style={{ fontSize: '3rem', marginBottom: '10px' }}>🎴</span>
                <strong style={{ fontSize: '1rem', color: '#fff' }}>カードを引く</strong>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                  タップしてドロー
                </span>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>🔒</span>
                <span style={{ fontSize: '0.8rem' }}>アクション実行中</span>
              </div>
            )}
          </div>

          {/* 市場状況 */}
          <div style={{ width: '100%', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
              🌍 市場（コモンボード）
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem' }}>材料市場の残り:</span>
              <strong style={{ color: 'var(--color-green)', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                {materialsInMarket} 個
              </strong>
            </div>
          </div>

        </div>

        {/* 右カラム：引いたカード ＆ アクション操作 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {phase !== 'draw' && currentCard ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* ドローされた現在のカードビジュアル */}
              <div 
                style={{ 
                  background: `linear-gradient(135deg, ${currentCard.color}15, rgba(10,12,22,0.9))`, 
                  border: `2px solid ${currentCard.color}`, 
                  borderRadius: '16px', 
                  padding: '20px',
                  boxShadow: `0 0 15px ${currentCard.color}22`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>{currentCard.icon}</span> {currentCard.title}
                  </h4>
                  <span className="logo-badge" style={{ background: currentCard.color, color: '#000', fontWeight: '800' }}>
                    DECISION
                  </span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {currentCard.description}
                </p>
              </div>

              {/* アクションフェーズの操作パネル */}
              {phase === 'action' && (
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-light)', padding: '20px', borderRadius: '12px' }}>
                  <h5 style={{ fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                    ⚡ アクションを選択してください
                  </h5>

                  {/* 1. 仕入 (ツ) */}
                  {currentCard.type === CARD_TYPES.PURCHASE && (
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'end' }}>
                      <div className="form-group" style={{ width: '150px' }}>
                        <label>購入数量 (最大 {maxPurchaseQty}個)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          min="1" 
                          max={maxPurchaseQty} 
                          value={purchaseQty}
                          onChange={(e) => setPurchaseQty(Math.min(maxPurchaseQty, Math.max(1, Number(e.target.value))))}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          必要資金: <strong>¥{purchaseQty * 1}万</strong> (単価 ¥1万)
                        </div>
                        <button 
                          className="btn btn-primary"
                          onClick={() => handleCommitAction(CARD_TYPES.PURCHASE, { qty: purchaseQty, price: 1 })}
                          disabled={maxPurchaseQty <= 0}
                        >
                          材料仕入を確定する 📥
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. 製造 (コ・サ) */}
                  {currentCard.type === CARD_TYPES.PRODUCE && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div style={{ display: 'flex', gap: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="prodType" 
                            checked={produceType === 'input'} 
                            onChange={() => setProduceType('input')} 
                          />
                          材料投入 (コ) - 材料を仕掛品へ
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="prodType" 
                            checked={produceType === 'complete'} 
                            onChange={() => setProduceType('complete')} 
                          />
                            完成品加工 (サ) - 仕掛品を製品へ
                        </label>
                      </div>

                      <div style={{ display: 'flex', gap: '15px', alignItems: 'end' }}>
                        <div className="form-group" style={{ width: '150px' }}>
                          <label>加工個数</label>
                          <input 
                            type="number" 
                            className="form-input" 
                            min="1" 
                            value={produceQty}
                            onChange={(e) => setProduceQty(Math.max(1, Number(e.target.value)))}
                          />
                        </div>
                        <button 
                          className="btn btn-primary"
                          onClick={() => handleCommitAction(CARD_TYPES.PRODUCE, { type: produceType, qty: produceQty })}
                        >
                          製造を確定する ⚙️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. 直接即時販売 (キ) */}
                  {currentCard.type === CARD_TYPES.SALE_DIRECT && (
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'end' }}>
                      <div className="form-group" style={{ width: '120px' }}>
                        <label>販売単価 (万円)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={directSalePrice}
                          onChange={(e) => setDirectSalePrice(Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                      <div className="form-group" style={{ width: '120px' }}>
                        <label>販売個数 (Q)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={directSaleQty}
                          min="1"
                          onChange={(e) => setDirectSaleQty(Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          合計売上: <strong>¥{directSalePrice * directSaleQty}万</strong>
                        </div>
                        <button 
                          className="btn btn-primary"
                          onClick={() => handleCommitAction(CARD_TYPES.SALE_DIRECT, { price: directSalePrice, qty: directSaleQty })}
                        >
                          直接販売を確定する 💰
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 4. 競合入札 (ネ) */}
                  {currentCard.type === CARD_TYPES.SALE_AUCTION && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div style={{ display: 'flex', gap: '20px', alignItems: 'end' }}>
                        <div className="form-group" style={{ width: '120px' }}>
                          <label>販売個数 (Q)</label>
                          <input 
                            type="number" 
                            className="form-input" 
                            value={auctionQty} 
                            onChange={(e) => setAuctionQty(Math.max(1, Number(e.target.value)))}
                          />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          各自スマホまたは手元の価格を打ち込んでください。最高額が自動落札されます。
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {players.map((p, idx) => (
                          <div key={idx} className="form-group" style={{ borderLeft: `3px solid ${p.color}`, paddingLeft: '8px' }}>
                            <label style={{ fontSize: '0.7rem' }}>{p.name}</label>
                            <input 
                              type="number" 
                              className="form-input" 
                              placeholder="入札" 
                              value={bidPrices[idx]}
                              onChange={(e) => handlePriceChange(idx, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>

                      {highestPrice > 0 && winners.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 242, 254, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0, 242, 254, 0.15)', marginTop: '10px' }}>
                          <div>
                            落札企業: <strong style={{ color: players[winners[0]].color }}>{players[winners[0]].name}</strong> 
                            {winners.length > 1 && " (同額：優先判定要)"}
                            <span style={{ marginLeft: '10px' }}>単価: ¥{highestPrice}万 ✕ {auctionQty}個 = ¥{highestPrice * auctionQty}万</span>
                          </div>
                          <button 
                            className="btn btn-primary"
                            onClick={() => handleCommitAction(CARD_TYPES.SALE_AUCTION, { winnerIdx: winners[0], price: highestPrice, qty: auctionQty })}
                          >
                            落札を適用・確定する ⚔️
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 5. 機械購入 (ケ) */}
                  {currentCard.type === CARD_TYPES.BUY_MACHINE && (
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'end' }}>
                      <div className="form-group" style={{ width: '180px' }}>
                        <label>機械タイプ</label>
                        <select 
                          className="form-select" 
                          value={machineType}
                          onChange={(e) => setMachineType(e.target.value)}
                        >
                          <option value="small">小型機械 (価格 ¥40万 / 償却 ¥10万)</option>
                          <option value="large">大型機械 (価格 ¥80万 / 償却 ¥20万)</option>
                          <option value="attachment">アタッチメント (価格 ¥10万 / 償却 ¥2万)</option>
                        </select>
                      </div>
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleCommitAction(CARD_TYPES.BUY_MACHINE, { type: machineType })}
                      >
                        機械を購入する 🏗️
                      </button>
                    </div>
                  )}

                  {/* 6. 雇用 (シ) */}
                  {currentCard.type === CARD_TYPES.HIRE && (
                    <div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        社員を1名雇用します。今期から社員数が増加し、期末労務費が増えますが、仕入れや製造能力がアップします。
                      </p>
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleCommitAction(CARD_TYPES.HIRE, {})}
                      >
                        社員を雇用する 👤
                      </button>
                    </div>
                  )}

                  {/* 7. 借入 (オ) */}
                  {currentCard.type === CARD_TYPES.LOAN && (
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'end' }}>
                      <div className="form-group" style={{ width: '150px' }}>
                        <label>借入希望額 (万円)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          step="10"
                          value={loanAmount}
                          onChange={(e) => setLoanAmount(Math.max(10, Number(e.target.value)))}
                        />
                      </div>
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleCommitAction(CARD_TYPES.LOAN, { amount: loanAmount })}
                      >
                        融資を受ける 🏦
                      </button>
                    </div>
                  )}

                  {/* 8. 研究開発 (チ) */}
                  {currentCard.type === CARD_TYPES.RD && (
                    <div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        研究開発費（¥20万）を投資して、経営技術チップ（研究レベル）を+1します。
                      </p>
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleCommitAction(CARD_TYPES.RD, {})}
                      >
                        研究開発投資を実行 🔬
                      </button>
                    </div>
                  )}

                  {/* 9. 広告 (セ) */}
                  {currentCard.type === CARD_TYPES.AD && (
                    <div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        広告宣伝費（¥10万）を支払い、集客力を高めます。
                      </p>
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleCommitAction(CARD_TYPES.AD, {})}
                      >
                        広告宣伝費を支払う 📢
                      </button>
                    </div>
                  )}

                  {/* 10. 災害カード (火災・ミス・盗難) */}
                  {(currentCard.type === CARD_TYPES.RISK_FIRE || currentCard.type === CARD_TYPES.RISK_MISS || currentCard.type === CARD_TYPES.RISK_THEFT) && (
                    <div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-red)', fontWeight: '700', marginBottom: '10px' }}>
                        ⚠️ 重大なリスク・災害が発生しました！以下の適用ボタンを押して損失を計上してください。
                      </p>
                      <button 
                        className="btn btn-danger"
                        onClick={() => handleCommitAction(currentCard.type, {})}
                      >
                        災害を適用・確定する 💥
                      </button>
                    </div>
                  )}

                </div>
              )}

              {/* ターン終了待ちフェーズ */}
              {phase === 'resolved' && (
                <div style={{ background: 'rgba(5, 255, 161, 0.03)', border: '1px solid rgba(5, 255, 161, 0.15)', padding: '20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    🎉 アクションが正常に完了し、仕訳と在庫が自動起票されました！手番を終了してください。
                  </span>
                  <button className="btn btn-primary" onClick={onEndTurn}>
                    手番を終了する (Turn End) ➡️
                  </button>
                </div>
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '3rem', marginBottom: '15px' }}>🎲</span>
              <h4 style={{ fontWeight: '700' }}>手番プレイヤーの番です</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '5px' }}>
                左側の山札をタップして、経営意思決定カードをドローしてください！
              </p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

export default DigitalBoard;
