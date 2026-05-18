import React from 'react';
import { calculateFinancials } from '../utils/calculations';

function GlobalDashboard({ players, activePlayerIndex, onSelectPlayer, commonPeriod, commonTurn, onIncrementTurn, onResetGame }) {
  // 全プレイヤーの最新財務データを算出
  const computedPlayers = players.map((p, idx) => {
    const currentData = p.periods[p.currentPeriod] || { carryover: {}, ledger: [], actuals: {} };
    const results = calculateFinancials(currentData.carryover, currentData.ledger, currentData.actuals);
    return {
      index: idx,
      name: p.name,
      color: p.color,
      period: p.currentPeriod,
      cash: results.bs.cash,
      retainedEarnings: results.bs.retainedEarnings,
      capital: results.bs.capital,
      totalNetAssets: results.bs.totalNetAssets, // 自己資本
      margin: results.pl.margin,                 // 限界利益 (MQ)
      fixedCost: results.pl.fixedCost,           // 固定費 (F)
      operatingProfit: results.pl.operatingProfit, // 経常利益 (G)
      matEndingCount: results.mat.endingCount,
      wipEndingCount: results.wip.endingCount,
      prodEndingCount: results.prod.endingCount,
      largeMachines: results.machines.large,
      smallMachines: results.machines.small,
      workers: results.workers,
      rank: results.rank
    };
  });

  // 自己資本（純資産）の高い順にランキングを作成
  const rankedPlayers = [...computedPlayers].sort((a, b) => b.totalNetAssets - a.totalNetAssets);

  // 限界利益MQの合計値（グラフ最大値用）
  const maxNetAssets = Math.max(...computedPlayers.map(p => p.totalNetAssets), 300);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 共通ゲームマスターバー */}
      <div className="glass-card" style={{ padding: '15px 24px', marginBottom: '0', background: 'rgba(25, 30, 50, 0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="logo-badge" style={{ marginRight: '10px' }}>GAME MASTER</span>
            <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
              第 <strong style={{ color: 'var(--color-cyan)', fontSize: '1.3rem' }}>{commonPeriod}</strong> 期 
              | ターン: <strong style={{ color: 'var(--color-pink)', fontSize: '1.3rem' }}>{commonTurn}</strong> / 30
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={onIncrementTurn}>
              ターンを進める ➡️
            </button>
            <button className="btn btn-danger" style={{ height: '36px', fontSize: '0.8rem', padding: '0 12px' }} onClick={onResetGame}>
              全データ初期化 ⚠️
            </button>
          </div>
        </div>
      </div>

      {/* メイングリッド：自己資本ランキング & クイック工場ボード */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        
        {/* 自己資本（自己資本比率）ランキング */}
        <div className="glass-card" style={{ marginBottom: '0' }}>
          <div className="card-title-bar">
            <h3 className="card-title">
              <span style={{ color: 'var(--color-yellow)' }}>🏆</span> 自己資本（純資産）ランキング
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>目標: 自己資本 300万以上</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {rankedPlayers.map((p, rankIdx) => {
              const percentage = Math.min(100, Math.max(10, (p.totalNetAssets / maxNetAssets) * 100));
              const isLead = rankIdx === 0;
              const isSelected = p.index === activePlayerIndex;

              return (
                <div 
                  key={p.index} 
                  onClick={() => onSelectPlayer(p.index)}
                  className={`player-rank-card ${isSelected ? 'active' : ''}`}
                  style={{ 
                    '--player-color': p.color,
                    borderLeftWidth: '6px',
                    background: isSelected ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div 
                        className="player-avatar" 
                        style={{ 
                          background: p.color, 
                          width: '32px', 
                          height: '32px',
                          fontSize: '1rem',
                          boxShadow: isLead ? '0 0 10px rgba(255, 208, 0, 0.4)' : 'none'
                        }}
                      >
                        {rankIdx + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {p.name}
                          {isLead && <span style={{ fontSize: '0.9rem' }}>👑</span>}
                          {p.totalNetAssets < 0 && <span className="logo-badge" style={{ background: 'var(--color-red)', fontSize: '0.65rem' }}>債務超過 ⚠️</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          第{p.period}期 | 評価: <strong style={{ color: p.operatingProfit >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{p.rank}</strong>
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>自己資本 (純資産)</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: '800', color: 'var(--color-yellow)' }}>
                        ¥{p.totalNetAssets}万
                      </div>
                    </div>
                  </div>

                  {/* 視覚的バーメーター */}
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${percentage}%`, 
                        height: '100%', 
                        background: `linear-gradient(90deg, ${p.color}, #ffffff)`,
                        borderRadius: '3px',
                        boxShadow: `0 0 8px ${p.color}`,
                        transition: 'width 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)'
                      }}
                    />
                  </div>

                  {/* サブ指標 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    <span>現金: <strong style={{ color: 'var(--color-cyan)' }}>¥{p.cash}万</strong></span>
                    <span>限界利益 (MQ): <strong style={{ color: 'var(--color-pink)' }}>¥{p.margin}万</strong></span>
                    <span>経常利益 (G): <strong style={{ color: p.operatingProfit >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>¥{p.operatingProfit}万</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4人の限界利益 (MQ) と 固定費 (F) 比較 */}
        <div className="glass-card" style={{ marginBottom: '0' }}>
          <div className="card-title-bar">
            <h3 className="card-title">
              <span style={{ color: 'var(--color-pink)' }}>📊</span> 限界利益 (MQ) vs 固定費 (F) 比較
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>経常利益 G = MQ - F</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0' }}>
            {computedPlayers.map(p => {
              const isProfit = p.operatingProfit >= 0;
              const ratio = p.fixedCost > 0 ? (p.margin / p.fixedCost) * 100 : 0;
              
              return (
                <div key={p.index} style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
                      {p.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: isProfit ? 'var(--color-green)' : 'var(--color-red)', fontWeight: '700' }}>
                      {isProfit ? `黒字: +¥${p.operatingProfit}万` : `赤字: ¥${p.operatingProfit}万`}
                    </span>
                  </div>

                  {/* ２重バー（上：限界利益MQ、下：固定費F） */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {/* MQ バー */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '35px', fontSize: '0.65rem', color: 'var(--color-pink)', fontWeight: '700' }}>MQ:</span>
                      <div style={{ flexGrow: '1', height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min(100, Math.max(0, (p.margin / 200) * 100))}%`, 
                            height: '100%', 
                            background: 'var(--color-pink)',
                            boxShadow: '0 0 6px var(--color-pink)',
                            transition: 'width 0.5s ease'
                          }} 
                        />
                      </div>
                      <span style={{ width: '50px', fontSize: '0.75rem', textAlign: 'right', fontFamily: 'var(--font-display)', color: 'var(--color-pink)', fontWeight: '600' }}>
                        ¥{p.margin}万
                      </span>
                    </div>

                    {/* F バー */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '35px', fontSize: '0.65rem', color: 'var(--color-purple)', fontWeight: '700' }}>F:</span>
                      <div style={{ flexGrow: '1', height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min(100, Math.max(0, (p.fixedCost / 200) * 100))}%`, 
                            height: '100%', 
                            background: 'var(--color-purple)',
                            boxShadow: '0 0 6px var(--color-purple)',
                            transition: 'width 0.5s ease'
                          }} 
                        />
                      </div>
                      <span style={{ width: '50px', fontSize: '0.75rem', textAlign: 'right', fontFamily: 'var(--font-display)', color: 'var(--color-purple)', fontWeight: '600' }}>
                        ¥{p.fixedCost}万
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 4人の工場の物理盤面状況一覧（ひと目で機械、人員、在庫がわかる！） */}
      <div className="glass-card" style={{ marginBottom: '0' }}>
        <div className="card-title-bar">
          <h3 className="card-title">
            <span style={{ color: 'var(--color-cyan)' }}>🏭</span> 4人の工場＆資源マトリクス（盤面ミニマップ）
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PC大画面で競合の設備投資を一元把握</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
          {computedPlayers.map(p => {
            const isSelected = p.index === activePlayerIndex;
            return (
              <div 
                key={p.index} 
                className={`glass-card`} 
                onClick={() => onSelectPlayer(p.index)}
                style={{ 
                  margin: 0, 
                  padding: '16px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                  borderColor: isSelected ? p.color : 'var(--border-light)',
                  borderWidth: isSelected ? '2px' : '1px',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.95rem', color: p.color }}>{p.name}</span>
                  <span className="logo-badge" style={{ background: p.color, color: '#000', fontSize: '0.65rem' }}>
                    期首 ¥{p.capital}万
                  </span>
                </div>

                <div className="minimap-grid">
                  {/* 設備 */}
                  <div className="minimap-section">
                    <div className="minimap-header">
                      <span>設備・人員</span>
                    </div>
                    <div className="facility-slots" style={{ gap: '4px' }}>
                      {Array.from({ length: p.largeMachines }).map((_, i) => (
                        <span key={`l-${i}`} className="machine-slot large" title="大型機械">大 ⚙️</span>
                      ))}
                      {Array.from({ length: p.smallMachines }).map((_, i) => (
                        <span key={`s-${i}`} className="machine-slot" title="小型機械">小 ⚙️</span>
                      ))}
                      {Array.from({ length: p.workers }).map((_, i) => (
                        <span key={`w-${i}`} className="worker-slot" title="社員">👤</span>
                      ))}
                      {p.largeMachines === 0 && p.smallMachines === 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>機械なし (0)</span>
                      )}
                    </div>
                  </div>

                  {/* 在庫 */}
                  <div className="minimap-section">
                    <div className="minimap-header">
                      <span>リアル在庫</span>
                    </div>
                    <div className="stock-pile" style={{ gap: '6px' }}>
                      <div className="stock-box" style={{ padding: '4px' }}>
                        <div className="stock-count" style={{ fontSize: '1.1rem' }}>{p.matEndingCount}</div>
                        <div className="stock-label" style={{ fontSize: '0.55rem' }}>材料</div>
                      </div>
                      <div className="stock-box" style={{ padding: '4px', background: 'rgba(155, 81, 224, 0.05)', borderColor: 'rgba(155, 81, 224, 0.15)' }}>
                        <div className="stock-count" style={{ fontSize: '1.1rem', color: 'var(--color-purple)' }}>{p.wipEndingCount}</div>
                        <div className="stock-label" style={{ fontSize: '0.55rem' }}>仕掛</div>
                      </div>
                      <div className="stock-box" style={{ padding: '4px', background: 'rgba(255, 0, 127, 0.05)', borderColor: 'rgba(255, 0, 127, 0.15)' }}>
                        <div className="stock-count" style={{ fontSize: '1.1rem', color: 'var(--color-pink)' }}>{p.prodEndingCount}</div>
                        <div className="stock-label" style={{ fontSize: '0.55rem' }}>製品</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default GlobalDashboard;
