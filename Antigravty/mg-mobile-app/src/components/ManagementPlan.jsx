import React, { useState } from 'react';
import { calculateBudget } from '../utils/calculations';

function ManagementPlan({ budget, carryover, onUpdateBudget, results }) {
  const [currentScenario, setCurrentScenario] = useState('A'); // 'A', 'B', 'C'
  
  // シナリオ別の計画データを管理するためのローカル状態
  const [scenarios, setScenarios] = useState(() => {
    const defaultData = {
      targetG: 100,
      laborBudget: 80,
      manufacturingBudget: 20,
      depreciationBudget: 30,
      salesBudget: 15,
      adminBudget: 15,
      nonOperatingBudget: 5,
      rdBudget: 10
    };
    return {
      A: { ...defaultData, targetG: 150 },
      B: { ...defaultData, targetG: 80 },
      C: { ...defaultData, targetG: 50 }
    };
  });

  const activeBudget = scenarios[currentScenario];

  const handleInputChange = (field, val) => {
    const num = val === '' ? 0 : Number(val);
    const updatedScenario = {
      ...activeBudget,
      [field]: num
    };

    setScenarios(prev => ({
      ...prev,
      [currentScenario]: updatedScenario
    }));

    // 親コンポーネントの状態も同期 (代表としてA予算を保存)
    if (currentScenario === 'A') {
      onUpdateBudget(updatedScenario);
    }
  };

  const handleSliderChange = (val) => {
    handleInputChange('targetG', val);
  };

  // 各シナリオの計算結果を算出
  const calcResults = {
    A: calculateBudget(scenarios.A, carryover),
    B: calculateBudget(scenarios.B, carryover),
    C: calculateBudget(scenarios.C, carryover)
  };

  const activeResult = calcResults[currentScenario];

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      
      {/* シナリオの切り替え */}
      <div className="segmented-control">
        {['A', 'B', 'C'].map(scen => (
          <button
            key={scen}
            onClick={() => setCurrentScenario(scen)}
            className={`segment-item ${currentScenario === scen ? 'active' : ''}`}
          >
            {scen} 予算計画
          </button>
        ))}
      </div>

      {/* 目標利益と必要MQのサマリー */}
      <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(0, 176, 255, 0.12) 0%, rgba(28, 30, 41, 0.9) 100%)', borderColor: 'rgba(0, 176, 255, 0.25)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>目標利益 (G)</span>
            <div className="electric-number" style={{ fontSize: '2rem', color: 'var(--mg-blue)', margin: '4px 0' }}>
              ¥{activeBudget.targetG.toLocaleString()}<span style={{ fontSize: '0.9rem' }}>万</span>
            </div>
          </div>
          
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>必要付加価値 (必要MQ)</span>
            <div className="electric-number" style={{ fontSize: '2rem', color: 'var(--mg-pink)', margin: '4px 0' }}>
              ¥{activeResult.requiredMQ.toLocaleString()}<span style={{ fontSize: '0.9rem' }}>万</span>
            </div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>必要G + 固定費F</span>
          </div>
        </div>

        {/* リアルタイムシミュレーション用スライダー */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            <span>利益シミュレーター (G目標値の調整)</span>
            <span className="electric-number" style={{ color: 'var(--mg-blue)', fontWeight: '700' }}>¥{activeBudget.targetG}万</span>
          </div>
          <input
            type="range"
            min="-100"
            max="500"
            step="10"
            value={activeBudget.targetG}
            onChange={(e) => handleSliderChange(e.target.value)}
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: '3px',
              outline: 'none',
              cursor: 'pointer',
              accentColor: 'var(--mg-blue)'
            }}
          />
        </div>
      </div>

      {/* 固定費予算の設定 */}
      <div className="glass-card">
        <div className="glass-card-header">
          <h3 className="glass-card-title">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '20px', height: '20px', color: 'var(--mg-blue)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            ② 固定費予算 (F) の計画
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">労務費 (万)</label>
              <input
                type="number"
                value={activeBudget.laborBudget || ''}
                onChange={(e) => handleInputChange('laborBudget', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">製造経費 (万)</label>
              <input
                type="number"
                value={activeBudget.manufacturingBudget || ''}
                onChange={(e) => handleInputChange('manufacturingBudget', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">減価償却費 (万)</label>
              <input
                type="number"
                value={activeBudget.depreciationBudget || ''}
                onChange={(e) => handleInputChange('depreciationBudget', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">販売費 (万)</label>
              <input
                type="number"
                value={activeBudget.salesBudget || ''}
                onChange={(e) => handleInputChange('salesBudget', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">一般管理費 (万)</label>
              <input
                type="number"
                value={activeBudget.adminBudget || ''}
                onChange={(e) => handleInputChange('adminBudget', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">研究開発費 (万)</label>
              <input
                type="number"
                value={activeBudget.rdBudget || ''}
                onChange={(e) => handleInputChange('rdBudget', e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">営業外費用 (金利等・万)</label>
            <input
              type="number"
              value={activeBudget.nonOperatingBudget || ''}
              onChange={(e) => handleInputChange('nonOperatingBudget', e.target.value)}
              placeholder="0"
              className="form-input"
            />
          </div>

        </div>

        {/* 固定費予算合計 */}
        <div className="glass-card" style={{ margin: '16px 0 0 0', padding: '12px', background: 'rgba(255, 255, 255, 0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>固定費予算合計 (F):</span>
          <span className="electric-number" style={{ fontSize: '1.25rem', color: 'var(--mg-blue)' }}>
            ¥{activeResult.fixedCostTotal.toLocaleString()}万
          </span>
        </div>
      </div>

      {/* A/B/C 予算の比較表示 */}
      <div className="glass-card">
        <div className="glass-card-header">
          <h3 className="glass-card-title">📊 予算シナリオ比較 (G目標 vs 必要MQ)</h3>
        </div>
        <table className="premium-table">
          <thead>
            <tr>
              <th>シナリオ</th>
              <th>目標利益 (G)</th>
              <th>固定費 (F)</th>
              <th style={{ color: 'var(--mg-pink)' }}>必要MQ</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ fontWeight: currentScenario === 'A' ? '800' : 'normal', backgroundColor: currentScenario === 'A' ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td>A 予算</td>
              <td style={{ color: 'var(--mg-green)' }}>¥{scenarios.A.targetG}万</td>
              <td>¥{calcResults.A.fixedCostTotal}万</td>
              <td style={{ color: 'var(--mg-pink)', fontWeight: '700' }}>¥{calcResults.A.requiredMQ}万</td>
            </tr>
            <tr style={{ fontWeight: currentScenario === 'B' ? '800' : 'normal', backgroundColor: currentScenario === 'B' ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td>B 予算</td>
              <td style={{ color: 'var(--mg-green)' }}>¥{scenarios.B.targetG}万</td>
              <td>¥{calcResults.B.fixedCostTotal}万</td>
              <td style={{ color: 'var(--mg-pink)', fontWeight: '700' }}>¥{calcResults.B.requiredMQ}万</td>
            </tr>
            <tr style={{ fontWeight: currentScenario === 'C' ? '800' : 'normal', backgroundColor: currentScenario === 'C' ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td>C 予算</td>
              <td style={{ color: 'var(--mg-green)' }}>¥{scenarios.C.targetG}万</td>
              <td>¥{calcResults.C.fixedCostTotal}万</td>
              <td style={{ color: 'var(--mg-pink)', fontWeight: '700' }}>¥{calcResults.C.requiredMQ}万</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}

export default ManagementPlan;
