import React, { useState } from 'react';
import { CATEGORIES } from '../utils/calculations';
import CompanyBoardMinimap from './CompanyBoardMinimap';

function CashLedger({ carryover, ledger, onUpdateLedger, results }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [voucherNo, setVoucherNo] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('キ'); // Default to現金売上
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  
  // 電卓の状態
  const [calcInput, setCalcInput] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);

  // 新規取引の追加
  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (!selectedCategory) {
      alert("勘定科目を選択してください");
      return;
    }
    
    const finalAmount = amount === '' ? 0 : Number(amount);
    const finalQuantity = quantity === '' ? 0 : Number(quantity);
    const finalPrice = price === '' ? 0 : Number(price);

    const newEntry = {
      id: Date.now().toString(),
      voucherNo: voucherNo || (ledger.length + 1).toString(),
      category: selectedCategory,
      quantity: finalQuantity,
      price: finalPrice,
      amount: finalAmount || (finalQuantity * finalPrice)
    };

    onUpdateLedger([...ledger, newEntry]);
    
    // フォームリセット
    setVoucherNo('');
    setQuantity('');
    setPrice('');
    setAmount('');
    setCalcInput('');
    setShowAddModal(false);
  };

  // 取引の削除
  const handleDeleteTransaction = (id) => {
    if (window.confirm("この取引データを削除してもよろしいですか？")) {
      const updated = ledger.filter(entry => entry.id !== id);
      onUpdateLedger(updated);
    }
  };

  // 取引カテゴリ切り替え時の自動表示制御
  const handleCategorySelect = (symbol) => {
    setSelectedCategory(symbol);
    // 数量が必要ない科目の場合は数量と単価をリセット
    const needsQty = ["キ", "ネ", "コ", "サ", "ツ", "ケ"].includes(symbol);
    if (!needsQty) {
      setQuantity('');
      setPrice('');
    }
  };

  // 数量・単価変更時に金額を自動計算
  const handleQtyPriceChange = (type, val) => {
    if (type === 'qty') {
      setQuantity(val);
      const q = Number(val) || 0;
      const p = Number(price) || 0;
      setAmount((q * p).toString());
    } else {
      setPrice(val);
      const q = Number(quantity) || 0;
      const p = Number(val) || 0;
      setAmount((q * p).toString());
    }
  };

  // 電卓ボタンの処理
  const handleCalcBtnClick = (val) => {
    if (val === 'C') {
      setCalcInput('');
      setAmount('');
    } else if (val === '=') {
      try {
        // 安全な評価 (数値、小数点、四則演算記号のみ許容)
        if (/^[0-9.+\-*/\s()]+$/.test(calcInput)) {
          const evalResult = Function(`"use strict"; return (${calcInput})`)();
          setAmount(evalResult.toString());
          setCalcInput(evalResult.toString());
        } else {
          setCalcInput('Error');
        }
      } catch (e) {
        setCalcInput('Error');
      }
    } else {
      setCalcInput(prev => prev + val);
    }
  };

  // カテゴリ別の電卓表示状態と数量必要チェック
  const currentCatMeta = CATEGORIES[selectedCategory] || {};
  const isQtyNeeded = ["キ", "ネ", "コ", "サ", "ツ", "ケ"].includes(selectedCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 財務サマリーカード */}
      <div className="glass-card" style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(30, 32, 45, 0.8) 0%, rgba(20, 22, 31, 0.9) 100%)', border: '1px solid rgba(255, 46, 147, 0.15)' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          第 {ledger.length > 0 ? (ledger.length) : 0} 取引完了
        </span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>現在の手元現金残高</span>
          <span className="electric-number" style={{ fontSize: '2rem', color: results.bookEndingCash < 0 ? '#ef4444' : 'var(--text-primary)' }}>
            ¥ {results.bookEndingCash.toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: '500' }}>万</span>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>入金総額</span>
            <span className="electric-number" style={{ fontSize: '1rem', color: 'var(--mg-pink)' }}>+¥ {results.cashInflow} 万</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-glass)', paddingLeft: '8px' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>出金総額</span>
            <span className="electric-number" style={{ fontSize: '1rem', color: 'var(--mg-green)' }}>-¥ {results.cashOutflow} 万</span>
          </div>
        </div>
      </div>

      {/* 会社盤ミニマップのアコーディオン */}
      <div style={{ margin: '8px 16px' }}>
        <button
          type="button"
          onClick={() => setShowMinimap(!showMinimap)}
          className="btn-premium btn-secondary"
          style={{ 
            width: '100%', 
            padding: '10px', 
            fontSize: '0.78rem', 
            borderRadius: '10px', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '8px', 
            border: '1px solid rgba(0, 176, 255, 0.2)',
            background: showMinimap ? 'rgba(0, 176, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
            color: showMinimap ? '#00e676' : 'var(--text-secondary)'
          }}
        >
          {showMinimap ? "盤面ミニマップを非表示 ▽" : "🔮 リアルタイム会社盤ミニマップを表示 ▷"}
        </button>
        {showMinimap && (
          <div style={{ marginTop: '8px' }}>
            <CompanyBoardMinimap results={results} />
          </div>
        )}
      </div>

      {/* 取引履歴タイムライン */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
        <h3 style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-secondary)', margin: '16px 16px 8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          取引履歴タイムライン
          <span style={{ fontSize: '0.72rem', fontWeight: '500', color: 'var(--text-muted)' }}>
            期首現金: ¥{carryover.cash}万
          </span>
        </h3>
        
        {ledger.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', opacity: 0.5 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            取引データがありません。<br />
            右下の「＋」ボタンから最初の出納データを入力してください。
          </div>
        ) : (
          [...ledger].reverse().map((entry, index) => {
            const catMeta = CATEGORIES[entry.category] || { label: '未定義', color: 'pink' };
            const badgeClass = `badge badge-${catMeta.color}`;
            
            return (
              <div key={entry.id} className="glass-card" style={{ margin: '8px 16px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid var(--mg-${catMeta.color})` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className={badgeClass} style={{ width: '32px', height: '32px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '800' }}>
                    {entry.category}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: '700' }}>{catMeta.label}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>#{entry.voucherNo}</span>
                    </div>
                    {["キ", "ネ", "コ", "サ", "ツ", "ケ"].includes(entry.category) && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        数量: {entry.quantity} 個 × 単価 ¥{entry.price} 万
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="electric-number" style={{ fontSize: '1.05rem', fontWeight: '700', color: catMeta.type === 'inflow' ? 'var(--mg-pink)' : 'var(--text-primary)' }}>
                    {catMeta.type === 'inflow' ? '+' : '-'} ¥{entry.amount.toLocaleString()} 万
                  </span>
                  <button 
                    onClick={() => handleDeleteTransaction(entry.id)} 
                    style={{ background: 'none', border: 'none', color: '#ef4444', opacity: 0.4, cursor: 'pointer', padding: '4px' }}
                    aria-label="Delete transaction"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 新規取引追加フローティングボタン(FAB) */}
      <button 
        onClick={() => setShowAddModal(true)} 
        className="fab-btn" 
        style={{ position: 'absolute' }}
        aria-label="Add transaction"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '28px', height: '28px' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* ワンタップ追加ボトムシート（モーダル） */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">出納データの追加</h3>
              <button onClick={() => setShowAddModal(false)} className="modal-close">×</button>
            </div>

            <form onSubmit={handleAddTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* 伝票番号 */}
              <div className="form-group">
                <label className="form-label">伝票番号 (任意)</label>
                <input 
                  type="text" 
                  value={voucherNo} 
                  onChange={(e) => setVoucherNo(e.target.value)}
                  placeholder={`自動連番: ${(ledger.length + 1)}`}
                  className="form-input"
                />
              </div>

              {/* 勘定科目のワンタップ選択グリッド */}
              <div>
                <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>勘定科目を選択</label>
                
                {/* 入金カテゴリ */}
                <span style={{ fontSize: '0.68rem', color: 'var(--mg-pink)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>入金 (ピンク)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '4px 0 12px 0' }}>
                  {Object.keys(CATEGORIES).filter(k => CATEGORIES[k].type === "inflow").map(symbol => (
                    <button
                      type="button"
                      key={symbol}
                      onClick={() => handleCategorySelect(symbol)}
                      className={`btn-premium ${selectedCategory === symbol ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '10px' }}
                    >
                      <span style={{ fontWeight: '800', marginRight: '4px' }}>{symbol}</span> {CATEGORIES[symbol].label}
                    </button>
                  ))}
                </div>

                {/* 出金カテゴリ */}
                <span style={{ fontSize: '0.68rem', color: 'var(--mg-green)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>出金 (グリーン/ブルー/イエロー)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '4px 0 0 0' }}>
                  {Object.keys(CATEGORIES).filter(k => CATEGORIES[k].type === "outflow").map(symbol => (
                    <button
                      type="button"
                      key={symbol}
                      onClick={() => handleCategorySelect(symbol)}
                      className={`btn-premium ${selectedCategory === symbol ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '10px', borderColor: selectedCategory === symbol ? 'var(--color-accent)' : `rgba(var(--color-${CATEGORIES[symbol].color === 'blue' ? 'blue' : CATEGORIES[symbol].color === 'yellow' ? 'yellow' : 'green'}), 0.15)` }}
                    >
                      <span style={{ fontWeight: '800', marginRight: '4px' }}>{symbol}</span> {CATEGORIES[symbol].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 選択中の科目の説明 */}
              <div className="glass-card" style={{ margin: '4px 0', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: '700' }}>
                  選択中: <span style={{ color: `var(--mg-${currentCatMeta.color})` }}>[{selectedCategory}] {currentCatMeta.label}</span>
                </span>
                <span className={`badge badge-${currentCatMeta.color}`}>
                  {currentCatMeta.type === 'inflow' ? '入金' : '出金'}
                </span>
              </div>

              {/* 数量・単価入力（対応する勘定科目のみ） */}
              {isQtyNeeded && (
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">数量 (個数)</label>
                    <input 
                      type="number" 
                      value={quantity} 
                      onChange={(e) => handleQtyPriceChange('qty', e.target.value)}
                      placeholder="0"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">単価 (万/個)</label>
                    <input 
                      type="number" 
                      value={price} 
                      onChange={(e) => handleQtyPriceChange('price', e.target.value)}
                      placeholder="0"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* 金額入力 ＆ 内蔵電卓への切り替え */}
              <div className="form-group" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">合計金額 (万)</label>
                  <button 
                    type="button" 
                    onClick={() => setShowCalculator(!showCalculator)} 
                    style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    {showCalculator ? "キーボード入力を使う" : "🧮 簡単電卓を使う"}
                  </button>
                </div>
                
                <input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="金額を入力"
                  className="form-input"
                  style={{ fontSize: '1.25rem', fontWeight: '700' }}
                  disabled={showCalculator}
                />

                {/* 電卓ポップアップ */}
                {showCalculator && (
                  <div className="glass-card" style={{ padding: '10px', marginTop: '8px', border: '1px solid var(--border-glass-focused)', background: 'var(--bg-glass-heavy)' }}>
                    {/* 電卓用インプット表示 */}
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', textAlign: 'right', fontSize: '1.2rem', fontFamily: 'monospace', fontWeight: '700', marginBottom: '8px', height: '38px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {calcInput || '0'}
                    </div>
                    {/* 電卓キーパッド */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {['7', '8', '9', '/'].map(k => <button type="button" key={k} onClick={() => handleCalcBtnClick(k)} className="btn-premium btn-secondary" style={{ padding: '8px 0', fontSize: '1rem', borderRadius: '8px' }}>{k}</button>)}
                      {['4', '5', '6', '*'].map(k => <button type="button" key={k} onClick={() => handleCalcBtnClick(k)} className="btn-premium btn-secondary" style={{ padding: '8px 0', fontSize: '1rem', borderRadius: '8px' }}>{k}</button>)}
                      {['1', '2', '3', '-'].map(k => <button type="button" key={k} onClick={() => handleCalcBtnClick(k)} className="btn-premium btn-secondary" style={{ padding: '8px 0', fontSize: '1rem', borderRadius: '8px' }}>{k}</button>)}
                      {['0', '.', 'C', '+'].map(k => <button type="button" key={k} onClick={() => handleCalcBtnClick(k)} className="btn-premium btn-secondary" style={{ padding: '8px 0', fontSize: '1rem', borderRadius: '8px', backgroundColor: k === 'C' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: k === 'C' ? '#ef4444' : 'inherit' }}>{k}</button>)}
                    </div>
                    <button type="button" onClick={() => handleCalcBtnClick('=')} className="btn-premium btn-primary" style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '1rem', borderRadius: '8px' }}>
                      ＝ 決定して金額へ反映
                    </button>
                  </div>
                )}
              </div>

              {/* 決定ボタン */}
              <button 
                type="submit" 
                className="btn-premium btn-primary" 
                style={{ width: '100%', padding: '14px', fontSize: '1.05rem', marginTop: '8px' }}
              >
                取引を追加する
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CashLedger;
