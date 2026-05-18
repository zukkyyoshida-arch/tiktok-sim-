import React, { useState } from 'react';

function PeriodEndWizard({ carryover, ledger, actuals, onUpdateActuals, results }) {
  const [step, setStep] = useState(1); // 1: 事故棚卸, 2: 設備・人員確認, 3: 決算バランス確認

  const handleActualChange = (field, val) => {
    onUpdateActuals({
      ...actuals,
      [field]: Math.max(0, Number(val) || 0)
    });
  };

  return (
    <div className="glass-card">
      <div className="card-title-bar">
        <h3 className="card-title" style={{ color: 'var(--color-yellow)' }}>
          🏁 期末決算処理ウィザード
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>順番に進めて正しい決算書を完成させましょう</span>
      </div>

      {/* ステップインジケーター */}
      <div className="wizard-step-indicator">
        <div className={`wizard-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>1</div>
        <div className={`wizard-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>2</div>
        <div className={`wizard-step ${step === 3 ? 'active' : ''}`}>3</div>
      </div>

      {/* ステップ 1: 事故棚卸 */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>ステップ 1: 実地棚卸と事故災害損失の入力</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              今期中にゲーム内で発生した「火災」「製造ミス（ロスト）」「盗難」の個数を入力してください。
              これらは在庫評価から除外され、<strong>特別損失（災害損失）</strong>として自動計上されます。
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            <div className="form-group" style={{ background: 'rgba(255, 56, 56, 0.03)', border: '1px solid rgba(255, 56, 56, 0.15)', padding: '15px', borderRadius: '10px' }}>
              <label style={{ color: 'var(--color-red)' }}>🔥 火災 (材料個数)</label>
              <input 
                type="number" 
                className="form-input" 
                value={actuals.fireCount || 0}
                onChange={(e) => handleActualChange('fireCount', e.target.value)}
                min="0"
                style={{ marginTop: '8px' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                損失額: ¥{Math.round(results.mat.fireValue)}万円
              </span>
            </div>

            <div className="form-group" style={{ background: 'rgba(155, 81, 224, 0.03)', border: '1px solid rgba(155, 81, 224, 0.15)', padding: '15px', borderRadius: '10px' }}>
              <label style={{ color: 'var(--color-purple)' }}>💥 製造ミス (仕掛品個数)</label>
              <input 
                type="number" 
                className="form-input" 
                value={actuals.missCount || 0}
                onChange={(e) => handleActualChange('missCount', e.target.value)}
                min="0"
                style={{ marginTop: '8px' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                損失額: ¥{Math.round(results.wip.missValue)}万円
              </span>
            </div>

            <div className="form-group" style={{ background: 'rgba(255, 0, 127, 0.03)', border: '1px solid rgba(255, 0, 127, 0.15)', padding: '15px', borderRadius: '10px' }}>
              <label style={{ color: 'var(--color-pink)' }}>🕵️ 盗難 (製品個数)</label>
              <input 
                type="number" 
                className="form-input" 
                value={actuals.theftCount || 0}
                onChange={(e) => handleActualChange('theftCount', e.target.value)}
                min="0"
                style={{ marginTop: '8px' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                損失額: ¥{Math.round(results.prod.theftValue)}万円
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              次へ：設備・人員確認 ➡️
            </button>
          </div>
        </div>
      )}

      {/* ステップ 2: 設備・人員確認 */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>ステップ 2: 生産設備と人員の期末監査</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              期末時点での工場の「機械台数」と「社員数」が、期首繰越＋今期取引（ケでの購入等）と一致しているか確認します。
              これに基づき、<strong>減価償却費</strong>および<strong>労務費（社員の人件費）</strong>の計算が行われます。
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '10px' }}>
              <h5 style={{ color: 'var(--color-purple)', marginBottom: '10px', fontSize: '0.85rem' }}>🤖 機械工具の減価償却チェック</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>大型機械 (減価償却 ¥20万/台):</span>
                  <strong>{carryover.largeMachines || 0} 台</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>小型機械 (減価償却 ¥10万/台):</span>
                  <strong>{carryover.smallMachines || 0} 台</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>アタッチメント (減価償却 ¥2万/個):</span>
                  <strong>{carryover.attachments || 0} 個</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-light)', paddingTop: '6px', marginTop: '4px', fontWeight: '700' }}>
                  <span>合計自動計上される減価償却費:</span>
                  <span style={{ color: 'var(--color-purple)' }}>¥{results.machines.depreciation}万円</span>
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '10px' }}>
              <h5 style={{ color: 'var(--color-cyan)', marginBottom: '10px', fontSize: '0.85rem' }}>👤 人員構成チェック</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>社員数 (期首設定に基づく):</span>
                  <strong>{results.workers} 名</strong>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                  ※ 社員雇用やリストラを行った場合は、出納帳への「労務費（シ）」の起票、および「設定」タブでの期首社員数の整合性を確認してください。
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
            <button className="btn" onClick={() => setStep(1)}>
              ⬅️ 戻る
            </button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              次へ：決算監査 ➡️
            </button>
          </div>
        </div>
      )}

      {/* ステップ 3: 決算バランス確認 */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>ステップ 3: 決算バランス監査 (監査完了)</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              決算書が財務諸表ルール（B/S 左右一致）を完全に満たしているかチェックします。
            </p>
          </div>

          {results.bs.difference === 0 ? (
            <div style={{ background: 'rgba(5, 255, 161, 0.05)', border: '1px solid rgba(5, 255, 161, 0.2)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '8px' }}>🎉</span>
              <h4 style={{ color: 'var(--color-green)', fontWeight: '700', fontSize: '1.1rem' }}>バランス監査 合格！</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                貸借対照表 (B/S) の資産合計と負債・純資産合計が ¥{results.bs.totalAssets}万円 で完璧に一致しています！
              </p>
              <div style={{ marginTop: '15px', fontSize: '0.8rem' }}>
                今期の最終純利益: <strong style={{ color: 'var(--color-cyan)' }}>¥{Math.round(results.pl.netProfit)}万円</strong>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(255, 56, 56, 0.05)', border: '1px solid rgba(255, 56, 56, 0.2)', padding: '20px', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--color-red)', fontWeight: '700', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ バランスエラー検出！ (ズレ: ¥{results.bs.difference}万)
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                貸借対照表 (B/S) の左右の合計に不一致があります。
              </p>
              <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem' }}>
                <strong>考えられる原因:</strong>
                <ul style={{ paddingLeft: '20px', marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>材料購入「ツ」の数量と金額はあっていますか？</li>
                  <li>完成サでの完成個数はあっていますか？</li>
                  <li>「期首繰越（設定）」の左右バランスはあっていますか？</li>
                  <li>仕訳の中に金額と数量があべこべになっている箇所はありませんか？</li>
                </ul>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
            <button className="btn" onClick={() => setStep(2)}>
              ⬅️ 戻る
            </button>
            
            {results.bs.difference === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-green)', fontWeight: '600', alignSelf: 'center' }}>
                ✅ 決算は完全にクリアです！今期の経営成績を確定しましょう。
              </span>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default PeriodEndWizard;
