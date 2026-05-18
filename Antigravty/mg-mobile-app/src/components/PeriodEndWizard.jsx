import React, { useState } from 'react';

function PeriodEndWizard({ carryover, ledger, actuals, onUpdateActuals, results }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [actualMaterials, setActualMaterials] = useState(actuals.actualMaterials || 0);
  const [actualWip, setActualWip] = useState(actuals.actualWip || 0);
  const [actualProduct, setActualProduct] = useState(actuals.actualProduct || 0);
  const [actualCash, setActualCash] = useState(actuals.actualCash || 0);

  const handleStepChange = (step) => {
    setCurrentStep(step);
  };

  const handleActualChange = (field, val) => {
    const num = val === '' ? 0 : Number(val);
    if (field === 'mat') {
      setActualMaterials(num);
      onUpdateActuals({ ...actuals, actualMaterials: num });
    } else if (field === 'wip') {
      setActualWip(num);
      onUpdateActuals({ ...actuals, actualWip: num });
    } else if (field === 'prod') {
      setActualProduct(num);
      onUpdateActuals({ ...actuals, actualProduct: num });
    } else if (field === 'cash') {
      setActualCash(num);
      onUpdateActuals({ ...actuals, actualCash: num });
    }
  };

  const handleAccidentChange = (field, val) => {
    const num = val === '' ? 0 : Number(val);
    onUpdateActuals({
      ...actuals,
      [field]: num
    });
  };

  // 材料/仕掛品/製品の帳簿残高 (理論値)
  const matTheoretical = results.mat.endingCount;
  const wipTheoretical = results.wip.endingCount;
  const prodTheoretical = results.prod.endingCount;
  const cashTheoretical = results.bookEndingCash;

  // 在庫不一致チェック
  const matMatches = matTheoretical === actualMaterials;
  const wipMatches = wipTheoretical === actualWip;
  const prodMatches = prodTheoretical === actualProduct;
  const cashMatches = cashTheoretical === actualCash;

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      
      {/* ステップインジケーター */}
      <div className="glass-card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {[1, 2, 3].map((step) => (
            <button
              key={step}
              onClick={() => handleStepChange(step)}
              className={`nav-item ${currentStep === step ? 'active' : ''}`}
              style={{ width: 'auto', height: 'auto', padding: '6px 12px', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', gap: '6px', flexDirection: 'row', alignItems: 'center' }}
            >
              <div 
                style={{ 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '50%', 
                  backgroundColor: currentStep === step ? 'var(--mg-pink)' : 'rgba(255, 255, 255, 0.1)', 
                  color: 'white', 
                  fontSize: '0.72rem', 
                  fontWeight: '800', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}
              >
                {step}
              </div>
              {step === 1 ? '在庫棚卸' : step === 2 ? '事故損失' : '現金合わせ'}
            </button>
          ))}
        </div>
      </div>

      {/* ステップ1: 在庫の棚卸 (盤と帳簿の照合) */}
      {currentStep === 1 && (
        <div className="tab-panel">
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title">
                📦 ステップ1: 盤の在庫棚卸
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              会社盤の上のコマ数（実際数）を数えて入力してください。出納帳から計算された「帳簿残高」と一致しているか照合します。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* 材料の棚卸 */}
              <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>1. 材料 (原料)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    帳簿上の理論値: <span className="electric-number" style={{ color: 'var(--text-primary)' }}>{matTheoretical} 個</span>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input
                      type="number"
                      value={actualMaterials || ''}
                      onChange={(e) => handleActualChange('mat', e.target.value)}
                      placeholder="盤の上の材料数"
                      className="form-input"
                      style={{ padding: '10px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {matMatches ? (
                      <span className="badge badge-green" style={{ width: '100%', padding: '8px 0' }}>✅ 一致 (OK)</span>
                    ) : (
                      <span className="badge badge-pink" style={{ width: '100%', padding: '8px 0' }}>⚠️ ズレあり</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 仕掛品の棚卸 */}
              <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>2. 仕掛品 (仕掛中)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    帳簿上の理論値: <span className="electric-number" style={{ color: 'var(--text-primary)' }}>{wipTheoretical} 個</span>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input
                      type="number"
                      value={actualWip || ''}
                      onChange={(e) => handleActualChange('wip', e.target.value)}
                      placeholder="盤の上の仕掛品数"
                      className="form-input"
                      style={{ padding: '10px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {wipMatches ? (
                      <span className="badge badge-green" style={{ width: '100%', padding: '8px 0' }}>✅ 一致 (OK)</span>
                    ) : (
                      <span className="badge badge-pink" style={{ width: '100%', padding: '8px 0' }}>⚠️ ズレあり</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 製品の棚卸 */}
              <div style={{ paddingBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>3. 製品 (完成品)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    帳簿上の理論値: <span className="electric-number" style={{ color: 'var(--text-primary)' }}>{prodTheoretical} 個</span>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input
                      type="number"
                      value={actualProduct || ''}
                      onChange={(e) => handleActualChange('prod', e.target.value)}
                      placeholder="盤の上の製品数"
                      className="form-input"
                      style={{ padding: '10px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {prodMatches ? (
                      <span className="badge badge-green" style={{ width: '100%', padding: '8px 0' }}>✅ 一致 (OK)</span>
                    ) : (
                      <span className="badge badge-pink" style={{ width: '100%', padding: '8px 0' }}>⚠️ ズレあり</span>
                    )}
                  </div>
                </div>
              </div>

            </div>
            
            <button
              onClick={() => handleStepChange(2)}
              className="btn-premium btn-primary"
              style={{ width: '100%', marginTop: '20px', padding: '12px' }}
            >
              次へ：事故・災害損失の記録 👉
            </button>
          </div>
        </div>
      )}

      {/* ステップ2: 事故災害メモ (火災・製造ミス・盗難) */}
      {currentStep === 2 && (
        <div className="tab-panel">
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title">
                🔥 ステップ2: 事故災害メモの入力
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              ゲーム中に発生した「火災」「製造ミス（WIP廃棄）」「盗難」の個数を入力してください。評価額を自動で特別損失に計上します。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* 火災 (材料) */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">火災 (材料の焼失)</label>
                  <input
                    type="number"
                    value={actuals.fireCount || ''}
                    onChange={(e) => handleAccidentChange('fireCount', e.target.value)}
                    placeholder="0"
                    className="form-input"
                    style={{ padding: '10px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>評価額損失</span>
                  <span className="electric-number" style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: '700' }}>
                    -¥{results.mat.fireValue.toFixed(1)}万
                  </span>
                </div>
              </div>

              {/* 製造ミス (仕掛品) */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">製造ミス (仕掛品廃棄)</label>
                  <input
                    type="number"
                    value={actuals.missCount || ''}
                    onChange={(e) => handleAccidentChange('missCount', e.target.value)}
                    placeholder="0"
                    className="form-input"
                    style={{ padding: '10px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>評価額損失</span>
                  <span className="electric-number" style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: '700' }}>
                    -¥{results.wip.missValue.toFixed(1)}万
                  </span>
                </div>
              </div>

              {/* 盗難 (製品) */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">盗難 (製品の紛失)</label>
                  <input
                    type="number"
                    value={actuals.theftCount || ''}
                    onChange={(e) => handleAccidentChange('theftCount', e.target.value)}
                    placeholder="0"
                    className="form-input"
                    style={{ padding: '10px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>評価額損失</span>
                  <span className="electric-number" style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: '700' }}>
                    -¥{results.prod.theftValue.toFixed(1)}万
                  </span>
                </div>
              </div>

            </div>

            {/* 事故災害総損失 */}
            <div className="glass-card" style={{ margin: '20px 0 0 0', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ef4444' }}>事故災害 総損失(特別損失):</span>
              <span className="electric-number" style={{ fontSize: '1.2rem', color: '#ef4444' }}>
                -¥{(results.mat.fireValue + results.wip.missValue + results.prod.theftValue).toLocaleString()}万
              </span>
            </div>
            
            <div className="grid-2" style={{ marginTop: '20px' }}>
              <button onClick={() => handleStepChange(1)} className="btn-premium btn-secondary" style={{ padding: '12px' }}>
                ◀ 戻る
              </button>
              <button onClick={() => handleStepChange(3)} className="btn-premium btn-primary" style={{ padding: '12px' }}>
                次へ：現金合わせ ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ステップ3: 現金合わせ (最終チェック) */}
      {currentStep === 3 && (
        <div className="tab-panel">
          <div className="glass-card">
            <div className="glass-card-header">
              <h3 className="glass-card-title">
                💰 ステップ3: 最終現金合わせ
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              会社盤のトレイにある「実際の現金紙幣」を数えて入力してください。出納帳の帳簿残高と完全に一致していれば決算成功です！
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>現在の帳簿残高（理論値）:</span>
                <span className="electric-number" style={{ fontSize: '1.2rem', color: 'var(--color-accent)' }}>
                  ¥{cashTheoretical.toLocaleString()}万
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">実際のトレイ上の現金 (万)</label>
                <input
                  type="number"
                  value={actualCash || ''}
                  onChange={(e) => handleActualChange('cash', e.target.value)}
                  placeholder="0"
                  className="form-input"
                  style={{ fontSize: '1.3rem', fontWeight: '800', textAlign: 'center', padding: '12px' }}
                />
              </div>

              {/* 照合結果 */}
              {cashMatches ? (
                <div className="glass-card animate-pulse" style={{ margin: '8px 0 0 0', padding: '16px', background: 'rgba(0, 230, 118, 0.08)', borderColor: 'rgba(0, 230, 118, 0.3)', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.4rem', marginRight: '6px' }}>🎉</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--mg-green)' }}>
                    現金残高が完全に一致しました！
                  </span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    帳簿と現金のズレはありません。第{results.rank}決算の「決算書」タブを確認して決算書を作成しましょう！
                  </p>
                </div>
              ) : (
                <div className="glass-card" style={{ margin: '8px 0 0 0', padding: '16px', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.4rem', marginRight: '6px' }}>⚠️</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ef4444' }}>
                    現金残高にズレがあります！
                  </span>
                  <div className="electric-number" style={{ fontSize: '1.1rem', color: '#ef4444', margin: '8px 0' }}>
                    ズレ金額: ¥{Math.abs(cashTheoretical - actualCash).toLocaleString()} 万
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {cashTheoretical > actualCash 
                      ? "帳簿上の現金が実際より多いです。出金の入力忘れ、または盤上の仕訳ミスがないか確認してください。" 
                      : "盤上の現金が帳簿より多いです。入金の入力忘れ、またはお釣りの渡し間違い等がないか確認してください。"}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => handleStepChange(2)}
              className="btn-premium btn-secondary"
              style={{ width: '100%', marginTop: '20px', padding: '12px' }}
            >
              ◀ 戻る
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default PeriodEndWizard;
