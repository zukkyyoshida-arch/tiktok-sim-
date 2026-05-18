import React from 'react';

function PriorPeriodCarryover({ 
  carryover, 
  onUpdateCarryover, 
  currentPeriod, 
  periods, 
  setCurrentPeriod, 
  rollForwardFromPrevious, 
  resetAllData 
}) {
  
  const handleInputChange = (field, value) => {
    const numVal = value === '' ? 0 : Number(value);
    onUpdateCarryover({
      ...carryover,
      [field]: numVal
    });
  };

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      {/* 期の選択 */}
      <div className="glass-card">
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '20px', height: '20px', color: 'var(--mg-pink)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 114 0v2m-4 0h4m-4 0H3m12 0h2M12 7V5m0 0a2 2 0 00-2-2H8a2 2 0 00-2 2v2m12-2a2 2 0 012 2v2" />
            </svg>
            アクティブ期の切り替え
          </h3>
        </div>
        
        <div className="grid-3" style={{ gap: '8px', margin: '8px 0' }}>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPeriod(p)}
              className={`btn-premium ${currentPeriod === p ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '10px 0', fontSize: '0.88rem' }}
            >
              第{p}期
            </button>
          ))}
        </div>

        {currentPeriod > 1 && (
          <button
            onClick={rollForwardFromPrevious}
            className="btn-premium btn-success"
            style={{ width: '100%', marginTop: '12px', padding: '10px' }}
          >
            ↩️ 第{currentPeriod - 1}期末の決算データを期首に引き継ぐ
          </button>
        )}
      </div>

      {/* 期首繰越金額の入力 */}
      <div className="glass-card">
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '20px', height: '20px', color: 'var(--mg-green)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            第{currentPeriod}期 期首繰越データ (前期繰越)
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 流動資産系 */}
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--mg-pink)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>流動資産項目</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">⑬ 現金 (万)</label>
                <input
                  type="number"
                  value={carryover.cash || ''}
                  onChange={(e) => handleInputChange('cash', e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">⑱ 売掛金 (万)</label>
                <input
                  type="number"
                  value={carryover.receivables || ''}
                  onChange={(e) => handleInputChange('receivables', e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
              </div>
            </div>

            {/* 在庫（材料、仕掛品、製品） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>⑧ 材料 (原料)</span>
                <input
                  type="number"
                  value={carryover.materialsCount || ''}
                  onChange={(e) => handleInputChange('materialsCount', e.target.value)}
                  placeholder="個数"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
                <input
                  type="number"
                  value={carryover.materialsValue || ''}
                  onChange={(e) => handleInputChange('materialsValue', e.target.value)}
                  placeholder="金額(万)"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>⑯ 仕掛品 (生産中)</span>
                <input
                  type="number"
                  value={carryover.wipCount || ''}
                  onChange={(e) => handleInputChange('wipCount', e.target.value)}
                  placeholder="個数"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
                <input
                  type="number"
                  value={carryover.wipValue || ''}
                  onChange={(e) => handleInputChange('wipValue', e.target.value)}
                  placeholder="金額(万)"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>⑧ 製品 (完成品)</span>
                <input
                  type="number"
                  value={carryover.productCount || ''}
                  onChange={(e) => handleInputChange('productCount', e.target.value)}
                  placeholder="個数"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
                <input
                  type="number"
                  value={carryover.productValue || ''}
                  onChange={(e) => handleInputChange('productValue', e.target.value)}
                  placeholder="金額(万)"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
              </div>
            </div>
          </div>

          <hr style={{ border: 'none', borderBottom: '1px solid var(--border-glass)' }} />

          {/* 固定資産（機械） */}
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--mg-purple)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>固定資産（⑭機械・設備）</h4>
            <div className="grid-3" style={{ marginBottom: '8px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.65rem' }}>大型機械 (台)</label>
                <input
                  type="number"
                  value={carryover.largeMachines || ''}
                  onChange={(e) => handleInputChange('largeMachines', e.target.value)}
                  placeholder="0"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.65rem' }}>小型機械 (台)</label>
                <input
                  type="number"
                  value={smallMachinesCount(carryover)}
                  onChange={(e) => handleInputChange('smallMachines', e.target.value)}
                  placeholder="0"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.65rem' }}>アタッチ (個)</label>
                <input
                  type="number"
                  value={carryover.attachments || ''}
                  onChange={(e) => handleInputChange('attachments', e.target.value)}
                  placeholder="0"
                  className="form-input"
                  style={{ padding: '8px' }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">⑭ 機械固定資産 簿価合計 (万)</label>
              <input
                type="number"
                value={carryover.machinesValue || ''}
                onChange={(e) => handleInputChange('machinesValue', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
          </div>

          <hr style={{ border: 'none', borderBottom: '1px solid var(--border-glass)' }} />

          {/* 負債・純資産系 */}
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--mg-yellow)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>負債・純資産項目</h4>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">⑰ 借入金 (万)</label>
                <input
                  type="number"
                  value={carryover.loan || ''}
                  onChange={(e) => handleInputChange('loan', e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">⑲ 買掛金 (万)</label>
                <input
                  type="number"
                  value={carryover.payables || ''}
                  onChange={(e) => handleInputChange('payables', e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
              </div>
            </div>
            <div className="grid-2" style={{ marginTop: '8px' }}>
              <div className="form-group">
                <label className="form-label">資本金 (万)</label>
                <input
                  type="number"
                  value={carryover.capital || ''}
                  onChange={(e) => handleInputChange('capital', e.target.value)}
                  placeholder="300"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">繰越利益剰余金 (万)</label>
                <input
                  type="number"
                  value={carryover.retainedEarnings || ''}
                  onChange={(e) => handleInputChange('retainedEarnings', e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
              </div>
            </div>
          </div>

          <hr style={{ border: 'none', borderBottom: '1px solid var(--border-glass)' }} />

          {/* 人員・組織 */}
          <div>
            <h4 style={{ fontSize: '0.85rem', color: '#00e676', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>人員・組織（従業員）</h4>
            <div className="form-group">
              <label className="form-label">👤 社員数 (人)</label>
              <input
                type="number"
                value={carryover.workers !== undefined ? carryover.workers : 3}
                onChange={(e) => handleInputChange('workers', e.target.value)}
                placeholder="3"
                className="form-input"
                min="0"
              />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                ※研修の開始時は通常3名（自分＋社員2名）です。機械の運転に必要となります。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ゲームデータ初期化 */}
      <div className="glass-card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
        <div className="glass-card-header">
          <h3 className="glass-card-title" style={{ color: '#ef4444' }}>
            🚨 リセット
          </h3>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          現在入力されている全5期分のすべての取引データ、期首繰越データ、予算データを削除し、最初からやり直します。
        </p>
        <button
          onClick={resetAllData}
          className="btn-premium btn-danger"
          style={{ width: '100%' }}
        >
          全てのゲームデータを初期化する
        </button>
      </div>
    </div>
  );
}

// ヘルパー: 前期繰越の小型機械数を正しく表示
function smallMachinesCount(carryover) {
  if (carryover.smallMachines !== undefined) return carryover.smallMachines;
  // レガシー対応
  return carryover.machinesCount - (carryover.largeMachines || 0);
}

export default PriorPeriodCarryover;
