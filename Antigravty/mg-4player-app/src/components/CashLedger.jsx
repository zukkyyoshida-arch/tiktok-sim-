import React, { useState } from 'react';
import { CATEGORIES } from '../utils/calculations';
import CompanyBoardMinimap from './CompanyBoardMinimap';

function CashLedger({ carryover, ledger, onUpdateLedger, results }) {
  const [category, setCategory] = useState('ツ');   // デフォルト材料仕入
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [memo, setMemo] = useState('');

  // エントリーの追加
  const handleAddEntry = (e) => {
    e.preventDefault();
    if (!category) return;
    
    const amt = Number(amount) || 0;
    const qty = Number(quantity) || 0;

    const newEntry = {
      id: Date.now().toString(),
      category,
      amount: amt,
      quantity: qty,
      memo: memo.trim() || CATEGORIES[category].label
    };

    onUpdateLedger([...ledger, newEntry]);

    // 入力フォームをクリア（カテゴリは維持）
    setAmount('');
    setQuantity('');
    setMemo('');
  };

  // エントリーの削除
  const handleDeleteEntry = (id) => {
    if (window.confirm("この取引履歴を削除してもよろしいですか？")) {
      onUpdateLedger(ledger.filter(entry => entry.id !== id));
    }
  };

  return (
    <div className="ledger-container">
      
      {/* 左：出納帳入力フォームと履歴リスト */}
      <div className="ledger-main">
        
        {/* 新規取引入力フォーム */}
        <div className="glass-card" style={{ marginBottom: '0' }}>
          <div className="card-title-bar">
            <h3 className="card-title">
              <span style={{ color: 'var(--color-cyan)' }}>✏️</span> 取引の起票 (出納帳入力)
            </h3>
          </div>

          <form onSubmit={handleAddEntry} className="ledger-input-form">
            <div className="form-group" style={{ width: '80px' }}>
              <label>科目記号</label>
              <select 
                className="form-select" 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
              >
                {Object.keys(CATEGORIES).map(k => (
                  <option key={k} value={k}>{k} ({CATEGORIES[k].label})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>摘要・メモ</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="取引の補足情報" 
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>金額 (万円)</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="0" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                required
              />
            </div>

            <div className="form-group">
              <label>数量・個数</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="0" 
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ height: '42px' }}>
              仕訳追加 ＋
            </button>
          </form>
        </div>

        {/* 取引履歴一覧 */}
        <div className="glass-card" style={{ marginBottom: '0' }}>
          <div className="card-title-bar">
            <h3 className="card-title">
              <span style={{ color: 'var(--text-secondary)' }}>📜</span> 取引履歴 (現金出納帳)
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              合計件数: <strong>{ledger.length}</strong> 件
            </span>
          </div>

          {ledger.length > 0 ? (
            <div className="ledger-table-wrapper">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>No.</th>
                    <th style={{ width: '130px' }}>勘定科目</th>
                    <th>摘要</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>金額 (万)</th>
                    <th style={{ width: '80px', textAlign: 'right' }}>数量</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry, idx) => {
                    const cat = CATEGORIES[entry.category] || { label: '未定義', color: 'blue', symbol: '？' };
                    return (
                      <tr key={entry.id}>
                        <td>{idx + 1}</td>
                        <td>
                          <span className={`badge-symbol symbol-${cat.color}`}>
                            {entry.category}
                          </span>
                          <strong style={{ fontSize: '0.8rem' }}>{cat.label}</strong>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{entry.memo}</td>
                        <td className="number-cell" style={{ color: cat.type === 'inflow' ? 'var(--color-cyan)' : 'var(--color-red)' }}>
                          {cat.type === 'inflow' ? '+' : '-'}¥{entry.amount}万
                        </td>
                        <td className="number-cell">{entry.quantity || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            type="button" 
                            className="btn btn-danger" 
                            style={{ width: '28px', height: '28px', padding: '0', borderRadius: '6px' }}
                            onClick={() => handleDeleteEntry(entry.id)}
                            title="削除"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📖</span>
              <p style={{ fontSize: '0.9rem' }}>取引データがありません。上のフォームから最初の仕訳を追加してください。</p>
            </div>
          )}
        </div>

      </div>

      {/* 右：工場ミニマップ & 資金状況サマリー */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* 資金状況・キャッシュチェック */}
        <div className="glass-card" style={{ marginBottom: '0' }}>
          <div className="card-title-bar" style={{ marginBottom: '15px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              🪙 資金流動性サマリー
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ background: 'rgba(0, 242, 254, 0.03)', border: '1px solid rgba(0, 242, 254, 0.15)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>現在の帳簿現金（⑬残高）</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: '800', color: 'var(--color-cyan)' }}>
                ¥{results.bookEndingCash}万
              </h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px dashed var(--border-light)', paddingTop: '6px' }}>
                <span>期首繰越: ¥{carryover.cash}万</span>
                <span>総入金: +¥{results.cashInflow}万</span>
                <span>総出金: -¥{results.cashOutflow}万</span>
              </div>
            </div>

            {/* B/S バランスチェック（警告灯） */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              background: results.bs.difference === 0 ? 'rgba(5, 255, 161, 0.05)' : 'rgba(255, 56, 56, 0.05)', 
              border: `1px solid ${results.bs.difference === 0 ? 'rgba(5, 255, 161, 0.2)' : 'rgba(255, 56, 56, 0.2)'}`,
              padding: '12px', 
              borderRadius: '8px' 
            }}>
              <span style={{ fontSize: '1.4rem' }}>
                {results.bs.difference === 0 ? '✅' : '🚨'}
              </span>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                  {results.bs.difference === 0 ? 'B/S バランス一致' : 'B/S 不一致エラー発生！'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {results.bs.difference === 0 
                    ? 'すべての勘定残高が完全に一致しています。' 
                    : `左右で ¥${results.bs.difference}万 のズレがあります。仕訳を見直してください。`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 自社工場のミニマップ */}
        <CompanyBoardMinimap results={results} carryover={carryover} />

      </div>

    </div>
  );
}

export default CashLedger;
