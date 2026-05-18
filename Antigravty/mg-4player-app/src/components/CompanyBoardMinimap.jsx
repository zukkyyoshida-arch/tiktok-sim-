import React from 'react';

function CompanyBoardMinimap({ results, carryover }) {
  const { machines, mat, wip, prod, workers } = results;

  return (
    <div className="glass-card" style={{ padding: '20px', background: 'rgba(10, 15, 30, 0.6)' }}>
      <div className="card-title-bar" style={{ marginBottom: '15px' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          🏭 自社工場（ボード）状況
        </h4>
      </div>

      <div className="minimap-grid">
        {/* 機械工具設備 (ケ) */}
        <div className="minimap-section">
          <div className="minimap-header">
            <span>生産機械 ⚙️</span>
            <span style={{ fontSize: '0.75rem', textTransform: 'none', color: 'var(--color-purple)' }}>
              簿価: ¥{machines.endingValue}万 (減価 ¥{machines.depreciation}万)
            </span>
          </div>
          <div className="facility-slots">
            {/* 大型機械 */}
            {Array.from({ length: machines.large }).map((_, i) => (
              <div key={`lg-${i}`} className="machine-slot large">
                <strong style={{ fontSize: '0.85rem' }}>大 ⚙️</strong>
                <span>(能力: 3個 / 減価: 20)</span>
              </div>
            ))}
            {/* 小型機械 */}
            {Array.from({ length: machines.small }).map((_, i) => (
              <div key={`sm-${i}`} className="machine-slot">
                <strong style={{ fontSize: '0.85rem' }}>小 ⚙️</strong>
                <span>(能力: 1個 / 減価: 10)</span>
              </div>
            ))}
            {/* アタッチメント */}
            {Array.from({ length: machines.attachments }).map((_, i) => (
              <div key={`att-${i}`} className="machine-slot" style={{ background: 'rgba(255, 208, 0, 0.05)', borderColor: 'rgba(255, 208, 0, 0.2)', color: 'var(--color-yellow)' }}>
                <strong>ア 🧩</strong>
                <span>(能力: +1個 / 減価: 2)</span>
              </div>
            ))}
            {machines.large === 0 && machines.small === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '5px' }}>
                生産設備がありません。機械工具（ケ）を購入してください。
              </span>
            )}
          </div>
        </div>

        {/* 人員 (労務費 シ) */}
        <div className="minimap-section">
          <div className="minimap-header">
            <span>社員・ワーカー 👤</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-cyan)' }}>初期: 3名</span>
          </div>
          <div className="facility-slots">
            {Array.from({ length: workers }).map((_, i) => (
              <div key={`wk-${i}`} className="worker-slot">
                👤 <span>社員 {i + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 在庫棚卸（材料・仕掛品・製品） */}
        <div className="minimap-section">
          <div className="minimap-header">
            <span>リアルタイム棚卸在庫</span>
          </div>
          <div className="stock-pile">
            {/* 材料 */}
            <div className="stock-box">
              <div className="stock-count">{mat.endingCount}</div>
              <div className="stock-label">材料 (ツ)</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                ¥{Math.round(mat.endingValue)}万<br />
                (単価: ¥{mat.unitCost ? mat.unitCost.toFixed(1) : 0}万)
              </div>
            </div>

            {/* 仕掛品 */}
            <div className="stock-box" style={{ background: 'rgba(155, 81, 224, 0.05)', borderColor: 'rgba(155, 81, 224, 0.15)' }}>
              <div className="stock-count" style={{ color: 'var(--color-purple)' }}>{wip.endingCount}</div>
              <div className="stock-label">仕掛品 (コ/サ)</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                ¥{Math.round(wip.endingValue)}万<br />
                (単価: ¥{wip.unitCost ? wip.unitCost.toFixed(1) : 0}万)
              </div>
            </div>

            {/* 製品 */}
            <div className="stock-box" style={{ background: 'rgba(255, 0, 127, 0.05)', borderColor: 'rgba(255, 0, 127, 0.15)' }}>
              <div className="stock-count" style={{ color: 'var(--color-pink)' }}>{prod.endingCount}</div>
              <div className="stock-label">製品 (サ/売上)</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                ¥{Math.round(prod.endingValue)}万<br />
                (単価: ¥{prod.unitCost ? prod.unitCost.toFixed(1) : 0}万)
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default CompanyBoardMinimap;
