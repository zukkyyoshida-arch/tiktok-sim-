import React, { useState } from 'react';

function FinancialStatements({ results, carryover }) {
  const [statementTab, setStatementTab] = useState('pl'); // 'pl', 'bs', 'cf'

  const pl = results.pl;
  const bs = results.bs;
  const cf = results.cf;

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      
      {/* 決算書タブ切り替え */}
      <div className="segmented-control">
        <button
          onClick={() => setStatementTab('pl')}
          className={`segment-item ${statementTab === 'pl' ? 'active' : ''}`}
        >
          変動損益計算書 (P/L)
        </button>
        <button
          onClick={() => setStatementTab('bs')}
          className={`segment-item ${statementTab === 'bs' ? 'active' : ''}`}
        >
          貸借対照表 (B/S)
        </button>
        <button
          onClick={() => setStatementTab('cf')}
          className={`segment-item ${statementTab === 'cf' ? 'active' : ''}`}
        >
          資金計算書 (C/F)
        </button>
      </div>

      {/* ==================== 1. 変動損益計算書 (P/L) ==================== */}
      {statementTab === 'pl' && (
        <div className="tab-panel">
          
          {/* MQ / G ハイライトカード */}
          <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(255, 46, 147, 0.12) 0%, rgba(28, 30, 41, 0.9) 100%)', borderColor: 'rgba(255, 46, 147, 0.25)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MQ 付加価値額</span>
                <div className="electric-number" style={{ fontSize: '2.2rem', color: 'var(--mg-pink)', margin: '4px 0' }}>
                  ¥{pl.margin.toLocaleString()}<span style={{ fontSize: '1rem' }}>万</span>
                </div>
                <span className="badge badge-pink" style={{ fontSize: '0.65rem' }}>m率 {pl.marginRatio.toFixed(1)}%</span>
              </div>
              
              <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.08)', paddingLeft: '20px', textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>G 経常利益</span>
                <div className="electric-number" style={{ fontSize: '2.2rem', color: pl.operatingProfit >= 0 ? 'var(--mg-green)' : '#ef4444', margin: '4px 0' }}>
                  ¥{pl.operatingProfit >= 0 ? '+' : ''}{pl.operatingProfit.toLocaleString()}<span style={{ fontSize: '1rem' }}>万</span>
                </div>
                <span className={`badge badge-${pl.operatingProfit >= 0 ? 'green' : 'pink'}`} style={{ fontSize: '0.65rem' }}>
                  評価: {results.rank} ランク
                </span>
              </div>
            </div>

            {/* 簡易財務比率メーター (SVGインラインゲージ) */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <span>変動費 vPQ ({((pl.variableCost / (pl.salesRevenue || 1)) * 100).toFixed(0)}%)</span>
                <span>固定費 F ({((pl.fixedCost / (pl.salesRevenue || 1)) * 100).toFixed(0)}%)</span>
                <span>経常利益 G</span>
              </div>
              <div style={{ width: '100%', height: '10px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${(pl.variableCost / (pl.salesRevenue || 1)) * 100}%`, backgroundColor: 'var(--mg-green)' }} />
                <div style={{ width: `${(pl.fixedCost / (pl.salesRevenue || 1)) * 100}%`, backgroundColor: 'var(--mg-blue)' }} />
                <div style={{ width: `${Math.max(0, pl.operatingProfit) / (pl.salesRevenue || 1) * 100}%`, backgroundColor: 'var(--mg-pink)' }} />
              </div>
            </div>
          </div>

          {/* P/L明細書テーブル */}
          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: '700', marginBottom: '8px', color: 'var(--text-secondary)' }}>㉖ 戦略会計変動損益計算書 (P/L)</h4>
            
            <table className="premium-table">
              <tbody>
                <tr>
                  <td style={{ fontWeight: '700' }}>売上高 (PQ)</td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>¥{pl.salesRevenue.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-secondary)', paddingLeft: '20px' }}>┗ 売上原価 / 変動費 (vPQ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>-¥{pl.variableCost.toLocaleString()}万</td>
                </tr>
                <tr style={{ borderBottom: '1px double var(--border-glass-focused)' }}>
                  <td style={{ fontWeight: '700', color: 'var(--mg-pink)' }}>付加価値 (mPQ)</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--mg-pink)' }}>¥{pl.margin.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '700' }}>固定費 (F) <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(f/m比: {pl.fmRatio.toFixed(0)}%)</span></td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--mg-blue)' }}>-¥{pl.fixedCost.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>労務費 (シ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-¥{pl.laborCost.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>製造固定費 (ス + 減価償却)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-¥{pl.manufacturingFixed.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>販売費 (セ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-¥{pl.salesCost.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>一般管理費 (ソ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-¥{pl.adminCost.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>研究開発費 (チ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-¥{pl.rdCost.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>営業外費用 (タ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>-¥{pl.nonOperatingCost.toLocaleString()}万</td>
                </tr>
                <tr style={{ borderBottom: '1px double var(--border-glass-focused)' }}>
                  <td style={{ fontWeight: '700' }}>経常利益 (G)</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: pl.operatingProfit >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                    ¥{pl.operatingProfit >= 0 ? '+' : ''}{pl.operatingProfit.toLocaleString()}万
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-secondary)' }}>特別損益 (イ + エ - 災害損失)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {pl.extraordinaryProfit >= 0 ? '+' : ''}¥{pl.extraordinaryProfit.toLocaleString()}万
                  </td>
                </tr>
                <tr style={{ fontWeight: '700' }}>
                  <td>税引前当期純利益</td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>¥{pl.profitBeforeTax.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-secondary)' }}>未払法人税等 (50%)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>-¥{pl.corporateTax.toLocaleString()}万</td>
                </tr>
                <tr style={{ borderTop: '2px double var(--border-glass-focused)', fontWeight: '800', fontSize: '1rem' }}>
                  <td>当期純利益</td>
                  <td style={{ textAlign: 'right', color: pl.netProfit >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                    ¥{pl.netProfit >= 0 ? '+' : ''}{pl.netProfit.toLocaleString()}万
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 2. 貸借対照表 (B/S) ==================== */}
      {statementTab === 'bs' && (
        <div className="tab-panel">
          
          {/* B/S不一致（バランス）エラー表示 */}
          {bs.difference > 0 && (
            <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)', margin: '8px 16px', textAlign: 'center' }}>
              <span style={{ fontWeight: '800', color: '#ef4444', fontSize: '0.88rem' }}>
                🚨 貸借対照表が不一致です！ズレ金額: ¥{bs.difference.toLocaleString()}万
              </span>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                期首繰越のバランス、出納帳の計算間違い、または期末の棚卸数が正しく合っているかチェックしてください。
              </p>
            </div>
          )}

          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: '700', marginBottom: '10px', color: 'var(--text-secondary)' }}>㉓ 貸借対照表 (B/S)</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* 資産の部 (Assets) */}
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--mg-pink)', borderBottom: '2px solid var(--mg-pink)', paddingBottom: '2px', textTransform: 'uppercase' }}>資産の部</span>
                <table className="premium-table" style={{ marginTop: '6px' }}>
                  <tbody>
                    <tr>
                      <td>現金 (⑬)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.cash.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>売掛金 (⑱)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.receivables.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>材料在庫 (ツ - コ - 火災)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.materialsValue.toLocaleString()}万 <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({results.mat.endingCount}個)</span></td>
                    </tr>
                    <tr>
                      <td>仕掛品在庫 (コ + サ - ミス)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.wipValue.toLocaleString()}万 <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({results.wip.endingCount}個)</span></td>
                    </tr>
                    <tr>
                      <td>製品在庫 (完成 - 売上 - 盗難)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.productValue.toLocaleString()}万 <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({results.prod.endingCount}個)</span></td>
                    </tr>
                    <tr style={{ fontWeight: '700', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                      <td>流動資産合計</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.totalCurrentAssets.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>固定資産 (⑭機械)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.fixedAssets.toLocaleString()}万</td>
                    </tr>
                    <tr style={{ fontWeight: '800', fontSize: '0.95rem', borderTop: '2px double var(--border-glass-focused)', color: 'var(--mg-pink)' }}>
                      <td>資産合計 (総資産)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.totalAssets.toLocaleString()}万</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 負債・純資産の部 (Liabilities & Net Assets) */}
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--mg-yellow)', borderBottom: '2px solid var(--mg-yellow)', paddingBottom: '2px', textTransform: 'uppercase' }}>負債・純資産の部</span>
                <table className="premium-table" style={{ marginTop: '6px' }}>
                  <tbody>
                    <tr>
                      <td>買掛金 (⑲)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.payables.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>借入金 (⑰)</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.loans.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>未払法人税等</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.unpaidTax.toLocaleString()}万</td>
                    </tr>
                    <tr style={{ fontWeight: '700', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                      <td>負債合計</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.totalLiabilities.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>資本金</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.capital.toLocaleString()}万</td>
                    </tr>
                    <tr>
                      <td>次期繰越利益剰余金 (㉒)</td>
                      <td style={{ textAlign: 'right', color: bs.retainedEarnings >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                        ¥{bs.retainedEarnings.toLocaleString()}万
                      </td>
                    </tr>
                    <tr style={{ fontWeight: '700', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                      <td>純資産合計</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.totalNetAssets.toLocaleString()}万</td>
                    </tr>
                    <tr style={{ fontWeight: '800', fontSize: '0.95rem', borderTop: '2px double var(--border-glass-focused)', color: 'var(--mg-yellow)' }}>
                      <td>負債・純資産合計</td>
                      <td style={{ textAlign: 'right' }}>¥{bs.totalLiabilitiesAndNetAssets.toLocaleString()}万</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ==================== 3. 資金計算書 (C/F) ==================== */}
      {statementTab === 'cf' && (
        <div className="tab-panel">
          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: '700', marginBottom: '10px', color: 'var(--text-secondary)' }}>㉔ キャッシュ・フロー計算書 (C/F)</h4>
            
            <table className="premium-table">
              <tbody>
                <tr>
                  <td style={{ fontWeight: '700' }}>営業活動によるC/F</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: cf.operatingCF >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                    ¥{cf.operatingCF >= 0 ? '+' : ''}{cf.operatingCF.toLocaleString()}万
                  </td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>┗ 税引前当期純利益</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>¥{pl.profitBeforeTax.toLocaleString()}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>┗ 減価償却費 (非資金)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>+¥{pl.manufacturingFixed - results.ledger.filter(e => e.category === 'ス').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)}万</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>┗ 在庫増減 (材料・仕掛・製品)</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    -¥{((bs.materialsValue + bs.wipValue + bs.productValue) - (carryover.materialsValue + carryover.wipValue + carryover.productValue)).toLocaleString()}万
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  <td style={{ color: 'var(--text-muted)', paddingLeft: '20px' }}>┗ 売掛・買掛増減</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    ¥{((bs.payables - carryover.payables) - (bs.receivables - carryover.receivables)).toLocaleString()}万
                  </td>
                </tr>
                
                <tr>
                  <td style={{ fontWeight: '700' }}>投資活動によるC/F (機械等)</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: cf.investingCF >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                    ¥{cf.investingCF >= 0 ? '+' : ''}{cf.investingCF.toLocaleString()}万
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-glass)', fontWeight: '700', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <td>フリーキャッシュフロー</td>
                  <td style={{ textAlign: 'right', color: cf.freeCF >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                    ¥{cf.freeCF >= 0 ? '+' : ''}{cf.freeCF.toLocaleString()}万
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  <td style={{ fontWeight: '700' }}>財務活動によるC/F (借入・資本)</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: cf.financingCF >= 0 ? 'var(--mg-green)' : '#ef4444' }}>
                    ¥{cf.financingCF >= 0 ? '+' : ''}{cf.financingCF.toLocaleString()}万
                  </td>
                </tr>
                
                <tr style={{ borderTop: '2px double var(--border-glass-focused)', fontWeight: '800', fontSize: '1rem', color: 'var(--mg-pink)' }}>
                  <td>当期キャッシュ増減</td>
                  <td style={{ textAlign: 'right' }}>
                    {cf.totalCF >= 0 ? '+' : ''}{cf.totalCF.toLocaleString()}万
                  </td>
                </tr>
                <tr style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>
                  <td>期末現金残高 (⑭)</td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>¥{bs.cash.toLocaleString()}万</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

export default FinancialStatements;
