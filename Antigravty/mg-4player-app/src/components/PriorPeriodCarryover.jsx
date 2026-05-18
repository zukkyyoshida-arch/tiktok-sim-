import React from 'react';

function PriorPeriodCarryover({ carryover, onUpdateCarryover, currentPeriod, periods, setCurrentPeriod, rollForwardFromPrevious, resetAllData }) {
  const handleInputChange = (field, val) => {
    onUpdateCarryover({
      ...carryover,
      [field]: Number(val) || 0
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 期間設定 & 引き継ぎ */}
      <div className="glass-card" style={{ marginBottom: '0' }}>
        <div className="card-title-bar">
          <h3 className="card-title">
            <span style={{ color: 'var(--color-yellow)' }}>⚙️</span> 期設定 ✕ 前期決算データの自動引き継ぎ
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div className="form-group" style={{ width: '120px' }}>
            <label>現在の期</label>
            <select 
              className="form-select" 
              value={currentPeriod} 
              onChange={(e) => setCurrentPeriod(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map(p => (
                <option key={p} value={p}>第 {p} 期</option>
              ))}
            </select>
          </div>

          <div style={{ flexGrow: '1' }}>
            {currentPeriod > 1 ? (
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  第 {currentPeriod - 1} 期末の決算が完了している場合、以下のボタンで今期首データへ自動引継ぎが行えます。
                </span>
                <div style={{ marginTop: '10px' }}>
                  <button className="btn btn-primary" onClick={rollForwardFromPrevious}>
                    前期末決算から自動引き継ぎ 📥
                  </button>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ※ 第1期は初期設定（資本金 ¥300万、現金 ¥300万から開始）です。
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 期首繰越データ詳細設定 */}
      <div className="glass-card" style={{ marginBottom: '0' }}>
        <div className="card-title-bar">
          <h3 className="card-title">
            <span style={{ color: 'var(--text-secondary)' }}>📊</span> 第{currentPeriod}期首 繰越データ内訳修正（B/S）
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-yellow)' }}>※ 通常は自動引き継ぎを使用するため、手動修正はエラー時の調整用です。</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* 資産側 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ color: 'var(--color-cyan)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
              資産の部（期首）
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>現金 (⑬)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.cash || 0} 
                  onChange={(e) => handleInputChange('cash', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>売掛金 (⑱)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.receivables || 0} 
                  onChange={(e) => handleInputChange('receivables', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>材料個数 (⑧)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.materialsCount || 0} 
                  onChange={(e) => handleInputChange('materialsCount', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>材料金額</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.materialsValue || 0} 
                  onChange={(e) => handleInputChange('materialsValue', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>仕掛品個数 (⑯)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.wipCount || 0} 
                  onChange={(e) => handleInputChange('wipCount', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>仕掛品金額</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.wipValue || 0} 
                  onChange={(e) => handleInputChange('wipValue', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>製品個数 (⑧)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.productCount || 0} 
                  onChange={(e) => handleInputChange('productCount', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>製品金額</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.productValue || 0} 
                  onChange={(e) => handleInputChange('productValue', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>機械台数 (⑭合計)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.machinesCount || 0} 
                  onChange={(e) => handleInputChange('machinesCount', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>機械工具簿価</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.machinesValue || 0} 
                  onChange={(e) => handleInputChange('machinesValue', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 負債・純資産側 & 工場内訳 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ color: 'var(--color-yellow)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
              負債・純資産の部 ＆ 物理内訳
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>買掛金 (⑲)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.payables || 0} 
                  onChange={(e) => handleInputChange('payables', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>借入金 (⑰)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.loan || 0} 
                  onChange={(e) => handleInputChange('loan', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>資本金</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.capital || 0} 
                  onChange={(e) => handleInputChange('capital', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>繰越利益剰余金 (㉒)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.retainedEarnings || 0} 
                  onChange={(e) => handleInputChange('retainedEarnings', e.target.value)}
                />
              </div>

              <div colspan="2" style={{ borderBottom: '1px dashed var(--border-light)', margin: '5px 0' }}></div>

              <div className="form-group">
                <label>大型機械台数 (大)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.largeMachines || 0} 
                  onChange={(e) => handleInputChange('largeMachines', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>小型機械台数 (小)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.smallMachines || 0} 
                  onChange={(e) => handleInputChange('smallMachines', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>アタッチメント数 (ア)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.attachments || 0} 
                  onChange={(e) => handleInputChange('attachments', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>期首社員数 (労務)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={carryover.workers || 3} 
                  onChange={(e) => handleInputChange('workers', e.target.value)}
                  min="1"
                />
              </div>
            </div>

            {/* 初期化アクション */}
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '15px' }}>
              <button className="btn btn-danger" style={{ width: '100%' }} onClick={resetAllData}>
                ⚠️ このプレイヤーの全期データを初期化
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

export default PriorPeriodCarryover;
