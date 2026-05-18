import React, { useState } from 'react';

function AuctionHelper({ players, onAddLedgerEntry }) {
  const [salesQty, setSalesQty] = useState(2);       // 販売個数
  const [bidPrices, setBidPrices] = useState({       // 各プレイヤーの入札額
    0: '',
    1: '',
    2: '',
    3: ''
  });
  const [useCashSale, setUseCashSale] = useState(false); // 現金売上（キ）にするか（デフォルトは売掛売上 ネ）

  const handlePriceChange = (playerIdx, val) => {
    setBidPrices(prev => ({
      ...prev,
      [playerIdx]: val
    }));
  };

  // 落札者を判定するロジック
  // ルール: 最高額を入札したプレイヤーが落札。
  // 同額の場合はMGの優先順位ルールがあるが、ここでは同額であれば複数、あるいは視覚的に確認できるようにする。
  const determineWinner = () => {
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

    return {
      highestPrice,
      winners
    };
  };

  const { highestPrice, winners } = determineWinner();

  // 落札結果をプレイヤーの出納帳に自動追加する
  const handleApplyAuction = (winnerIdx) => {
    if (highestPrice <= 0 || salesQty <= 0) {
      alert("有効な販売個数と入札額を入力してください。");
      return;
    }

    const winnerName = players[winnerIdx].name;
    const totalAmount = highestPrice * salesQty;
    const category = useCashSale ? "キ" : "ネ"; // キ: 現金売上, ネ: 売掛売上
    const catLabel = useCashSale ? "現金売上" : "売掛・売上";

    if (window.confirm(`【オークション適用】\n落札者: ${winnerName}\n単価: ¥${highestPrice}万 ✕ 個数: ${salesQty}個\n合計: ¥${totalAmount}万\n\nこの売上取引（${catLabel}）を ${winnerName} の出納帳に自動追記しますか？`)) {
      onAddLedgerEntry(winnerIdx, {
        category,
        amount: totalAmount,
        quantity: salesQty,
        memo: `競合落札（単価:${highestPrice}万）`
      });
      alert("出納帳への自動追記が完了しました！");
      
      // 入力値をリセット
      setBidPrices({
        0: '',
        1: '',
        2: '',
        3: ''
      });
    }
  };

  return (
    <div className="glass-card" style={{ marginBottom: '0' }}>
      <div className="card-title-bar">
        <h3 className="card-title">
          <span style={{ color: 'var(--color-pink)' }}>⚔️</span> 競合入札（オークション）落札アシスタント
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PC大画面で競りを行い、出納帳へ自動転記</span>
      </div>

      <div className="auction-layout">
        
        {/* 左側：入札額入力フォーム */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', gap: '20px', alignItems: 'end', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div className="form-group" style={{ flexGrow: '1' }}>
              <label>販売個数 (Q)</label>
              <input 
                type="number" 
                className="form-input" 
                value={salesQty} 
                onChange={(e) => setSalesQty(Math.max(1, Number(e.target.value)))}
                min="1"
              />
            </div>
            
            <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', height: '42px' }}>
              <input 
                type="checkbox" 
                id="useCashSale" 
                checked={useCashSale}
                onChange={(e) => setUseCashSale(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="useCashSale" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>現金売上(キ)にする</label>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              各プレイヤーの入札価格 (P)
            </span>
            
            {players.map((p, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.01)',
                  padding: '10px 15px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  borderLeft: `5px solid ${p.color}`
                }}
              >
                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="number" 
                    placeholder="入札額" 
                    className="form-input" 
                    style={{ width: '100px', height: '36px', textAlign: 'right' }}
                    value={bidPrices[idx]} 
                    onChange={(e) => handlePriceChange(idx, e.target.value)}
                    min="0"
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>万円</span>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* 右側：判定結果と自動適用ボタン */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(0, 242, 254, 0.02)', border: '1px dashed rgba(0, 242, 254, 0.15)', padding: '20px', borderRadius: '12px' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: '700', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
            ⚡ リアルタイム競り判定
          </h4>

          {highestPrice > 0 && winners.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>現在の最高入札額</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: '800', color: 'var(--color-cyan)', lineHeight: '1.2' }}>
                  ¥{highestPrice}万
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                  合計売上高 (PQ): <strong style={{ color: 'white' }}>¥{highestPrice * salesQty}万円</strong> (個数: {salesQty}個)
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>落札候補者</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {winners.map(wIdx => (
                    <div 
                      key={wIdx} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '10px 15px',
                        borderRadius: '8px',
                        border: `1px solid ${players[wIdx].color}`
                      }}
                    >
                      <span style={{ fontWeight: '700', color: players[wIdx].color }}>
                        {players[wIdx].name}
                      </span>
                      <button 
                        className="btn btn-primary" 
                        style={{ height: '32px', fontSize: '0.8rem', padding: '0 12px' }}
                        onClick={() => handleApplyAuction(wIdx)}
                      >
                        売上を適用 📥
                      </button>
                    </div>
                  ))}
                </div>
                {winners.length > 1 && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-yellow)', marginTop: '8px' }}>
                    ※ 同額入札です。MGルールに従い優先順位（例：外周順、社員数等）を決定し適用してください。
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '180px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2rem', marginBottom: '10px' }}>⚔️</span>
              <p style={{ fontSize: '0.85rem' }}>各プレイヤーの入札額を入力すると</p>
              <p style={{ fontSize: '0.85rem' }}>自動落札判定と出納帳適用が行えます</p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

export default AuctionHelper;
