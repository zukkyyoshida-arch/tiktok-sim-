import React, { useState } from 'react';

function FinancialStatements({ results, carryover }) {
  const [activeSubTab, setActiveSubTab] = useState('pl'); // pl, bs, manufacturing, cf
  const { pl, bs, mat, wip, prod, cf, rank } = results;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 決算書切り替えサブナビゲーション */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
        <button 
          className={`tab-btn ${activeSubTab === 'pl' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('pl')}
        >
          📈 変動損益計算書 (P/L)
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'bs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('bs')}
        >
          ⚖️ 貸借対照表 (B/S)
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'manufacturing' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('manufacturing')}
        >
          🏭 製造原価・棚卸報告書
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'cf' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('cf')}
        >
          💸 キャッシュフロー (C/F)
        </button>
      </div>

      {/* 決算書コンテンツ */}
      {activeSubTab === 'pl' && (
        <div className="statements-layout">
          {/* 変動損益計算書 */}
          <div className="glass-card" style={{ margin: 0 }}>
            <div className="card-title-bar">
              <h3 className="card-title" style={{ color: 'var(--color-pink)' }}>
                変動損益計算書 (P/L)
              </h3>
              <span className="logo-badge" style={{ background: pl.operatingProfit >= 50 ? 'var(--color-green)' : 'var(--color-red)', color: '#000' }}>
                経営ランク: {rank}
              </span>
            </div>

            <table className="statement-table">
              <tbody>
                <tr>
                  <td><strong>売上高 (PQ)</strong></td>
                  <td className="number-cell value-cyan">¥{pl.salesRevenue}万</td>
                </tr>
                <tr>
                  <td className="indent-1">変動費・売上原価 (vPQ)</td>
                  <td className="number-cell" style={{ color: 'var(--color-red)' }}>-¥{Math.round(pl.variableCost)}万</td>
                </tr>
                <tr className="total-row">
                  <td><strong>限界利益・付加価値 (MQ)</strong></td>
                  <td className="number-cell" style={{ color: 'var(--color-pink)' }}>¥{Math.round(pl.margin)}万</td>
                </tr>
                <tr>
                  <td className="indent-1">限界利益率 (m比率)</td>
                  <td className="number-cell">{pl.marginRatio.toFixed(1)}%</td>
                </tr>

                <tr>
                  <td colspan="2" style={{ padding: '15px 0 5px 0', border: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: '700' }}>
                    固定費項目 (F)
                  </td>
                </tr>
                <tr>
                  <td className="indent-1">労務費・人件費 (シ)</td>
                  <td className="number-cell">¥{pl.laborCost}万</td>
                </tr>
                <tr>
                  <td className="indent-1">製造固定費・減価償却 (ス + 償却)</td>
                  <td className="number-cell">¥{pl.manufacturingFixed}万</td>
                </tr>
                <tr>
                  <td className="indent-1">販売費 (セ)</td>
                  <td className="number-cell">¥{pl.salesCost}万</td>
                </tr>
                <tr>
                  <td className="indent-1">一般管理費 (ソ)</td>
                  <td className="number-cell">¥{pl.adminCost}万</td>
                </tr>
                <tr>
                  <td className="indent-1">研究開発費 (チ)</td>
                  <td className="number-cell">¥{pl.rdCost}万</td>
                </tr>
                <tr>
                  <td className="indent-1">営業外費用 (タ)</td>
                  <td className="number-cell">¥{pl.nonOperatingCost}万</td>
                </tr>
                <tr className="total-row">
                  <td><strong>固定費合計 (F)</strong></td>
                  <td className="number-cell" style={{ color: 'var(--color-purple)' }}>¥{pl.fixedCost}万</td>
                </tr>
                <tr>
                  <td className="indent-1">F/M比率 (固定費回収率)</td>
                  <td className="number-cell">{pl.fmRatio.toFixed(1)}%</td>
                </tr>

                <tr>
                  <td colspan="2" style={{ padding: '15px 0 5px 0', border: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: '700' }}>
                    利益計算
                  </td>
                </tr>
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                  <td><strong>経常利益 (G)</strong></td>
                  <td className="number-cell" style={{ color: pl.operatingProfit >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontWeight: '700' }}>
                    ¥{pl.operatingProfit}万
                  </td>
                </tr>
                <tr>
                  <td className="indent-1">特別利益 (エ 保険金 / イ 機械売却)</td>
                  <td className="number-cell">¥{pl.extraordinaryGain}万</td>
                </tr>
                <tr>
                  <td className="indent-1">特別損失 (事故災害損失: 火災・ミス・盗難)</td>
                  <td className="number-cell" style={{ color: 'var(--color-red)' }}>-¥{Math.round(pl.extraordinaryLoss)}万</td>
                </tr>
                <tr>
                  <td><strong>税引前当期純利益</strong></td>
                  <td className="number-cell">¥{Math.round(pl.profitBeforeTax)}万</td>
                </tr>
                <tr>
                  <td className="indent-1">法人税等 (50%ルール)</td>
                  <td className="number-cell" style={{ color: 'var(--color-red)' }}>-¥{pl.corporateTax}万</td>
                </tr>
                <tr className="total-row" style={{ background: 'rgba(0, 242, 254, 0.05)' }}>
                  <td><strong>当期純利益</strong></td>
                  <td className="number-cell" style={{ color: pl.netProfit >= 0 ? 'var(--color-cyan)' : 'var(--color-red)', fontSize: '1rem', fontWeight: '800' }}>
                    ¥{Math.round(pl.netProfit)}万
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 利益感度分析・CVP簡易分析 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-card" style={{ margin: 0, height: '100%' }}>
              <div className="card-title-bar">
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  📊 損益分岐点 (CVP) 分析
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>必要MQ (目標Gが0の時、Fを回収するための限界利益)</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--color-pink)', fontWeight: '700' }}>
                    ¥{pl.fixedCost}万
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                    現在の獲得MQ: <strong>¥{Math.round(pl.margin)}万</strong> 
                    ({pl.margin >= pl.fixedCost ? '損益分岐クリア！' : `あと ¥${Math.round(pl.fixedCost - pl.margin)}万 不足`})
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-light)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>損益分岐点売上高:</span>
                    <strong style={{ color: 'white' }}>
                      ¥{pl.marginRatio > 0 ? Math.round((pl.fixedCost / pl.marginRatio) * 100) : 0}万円
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-light)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>安全余裕率:</span>
                    <strong style={{ color: pl.operatingProfit >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                      {pl.margin > 0 ? (((pl.margin - pl.fixedCost) / pl.margin) * 100).toFixed(1) : 0}%
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'bs' && (
        <div className="statements-layout">
          {/* 貸借対照表 (B/S) */}
          <div className="glass-card" style={{ margin: 0 }}>
            <div className="card-title-bar">
              <h3 className="card-title" style={{ color: 'var(--color-cyan)' }}>
                貸借対照表 (B/S) - 資産の部
              </h3>
            </div>

            <table className="statement-table">
              <tbody>
                <tr>
                  <td><strong>流動資産</strong></td>
                  <td className="number-cell">¥{Math.round(bs.totalCurrentAssets)}万</td>
                </tr>
                <tr>
                  <td className="indent-1">現金預金 (⑬)</td>
                  <td className="number-cell value-cyan">¥{bs.cash}万</td>
                </tr>
                <tr>
                  <td className="indent-1">売掛金 (⑱)</td>
                  <td className="number-cell">¥{bs.receivables}万</td>
                </tr>
                <tr>
                  <td className="indent-1">棚卸資産（在庫）</td>
                  <td className="number-cell">¥{Math.round(bs.materialsValue + bs.wipValue + bs.productValue)}万</td>
                </tr>
                <tr>
                  <td className="indent-2">材料 (⑧)</td>
                  <td className="number-cell">¥{Math.round(bs.materialsValue)}万</td>
                </tr>
                <tr>
                  <td className="indent-2">仕掛品 (⑯)</td>
                  <td className="number-cell">¥{Math.round(bs.wipValue)}万</td>
                </tr>
                <tr>
                  <td className="indent-2">製品 (⑧)</td>
                  <td className="number-cell">¥{Math.round(bs.productValue)}万</td>
                </tr>

                <tr>
                  <td><strong>固定資産</strong></td>
                  <td className="number-cell">¥{bs.fixedAssets}万</td>
                </tr>
                <tr>
                  <td className="indent-1">機械工具設備 (⑭)</td>
                  <td className="number-cell" style={{ color: 'var(--color-purple)' }}>¥{bs.fixedAssets}万</td>
                </tr>

                <tr className="total-row" style={{ background: 'rgba(0, 242, 254, 0.03)' }}>
                  <td><strong>資産合計</strong></td>
                  <td className="number-cell" style={{ color: 'var(--color-cyan)', fontSize: '1rem', fontWeight: '800' }}>
                    ¥{Math.round(bs.totalAssets)}万
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="glass-card" style={{ margin: 0 }}>
            <div className="card-title-bar">
              <h3 className="card-title" style={{ color: 'var(--color-yellow)' }}>
                貸借対照表 (B/S) - 負債・純資産の部
              </h3>
              {bs.difference !== 0 && (
                <span className="logo-badge" style={{ background: 'var(--color-red)', color: 'white' }}>
                  バランスエラー: ¥{bs.difference}万 🚨
                </span>
              )}
            </div>

            <table className="statement-table">
              <tbody>
                <tr>
                  <td><strong>流動負債</strong></td>
                  <td className="number-cell">¥{bs.payables + bs.unpaidTax}万</td>
                </tr>
                <tr>
                  <td className="indent-1">買掛金 (⑲)</td>
                  <td className="number-cell">¥{bs.payables}万</td>
                </tr>
                <tr>
                  <td className="indent-1">未払法人税等</td>
                  <td className="number-cell">¥{bs.unpaidTax}万</td>
                </tr>
                
                <tr>
                  <td><strong>固定負債</strong></td>
                  <td className="number-cell">¥{bs.loans}万</td>
                </tr>
                <tr>
                  <td className="indent-1">長期借入金 (⑰)</td>
                  <td className="number-cell">¥{bs.loans}万</td>
                </tr>

                <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                  <td><strong>負債合計</strong></td>
                  <td className="number-cell">¥{bs.totalLiabilities}万</td>
                </tr>

                <tr>
                  <td colspan="2" style={{ border: 'none', height: '10px' }}></td>
                </tr>

                <tr>
                  <td><strong>純資産（自己資本）</strong></td>
                  <td className="number-cell" style={{ color: 'var(--color-yellow)' }}>¥{bs.totalNetAssets}万</td>
                </tr>
                <tr>
                  <td className="indent-1">資本金</td>
                  <td className="number-cell">¥{bs.capital}万</td>
                </tr>
                <tr>
                  <td className="indent-1">次期繰越利益剰余金 (㉒)</td>
                  <td className="number-cell" style={{ color: bs.retainedEarnings >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                    ¥{bs.retainedEarnings}万
                  </td>
                </tr>

                <tr className="total-row" style={{ background: 'rgba(255, 208, 0, 0.03)' }}>
                  <td><strong>負債・純資産合計</strong></td>
                  <td className="number-cell" style={{ color: 'var(--color-yellow)', fontSize: '1rem', fontWeight: '800' }}>
                    ¥{Math.round(bs.totalLiabilitiesAndNetAssets)}万
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'manufacturing' && (
        <div className="glass-card" style={{ margin: 0 }}>
          <div className="card-title-bar">
            <h3 className="card-title" style={{ color: 'var(--color-green)' }}>
              製造原価・在庫報告書 (製造業版MGの心臓部)
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            
            {/* 材料棚卸 & 投入 */}
            <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', padding: '16px', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--color-green)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '10px', fontSize: '0.9rem' }}>
                ① 材料在庫 (ツ・コ)
              </h4>
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <tbody>
                  <tr><td>期首材料残高</td><td style={{ textAlign: 'right' }}>¥{mat.beginningValue}万 ({mat.beginningCount}個)</td></tr>
                  <tr><td>当期材料仕入 (ツ)</td><td style={{ textAlign: 'right', color: 'var(--color-green)' }}>+¥{mat.purchaseValue}万 ({mat.purchaseCount}個)</td></tr>
                  <tr style={{ borderTop: '1px solid var(--border-light)' }}><td><strong>材料合計</strong></td><td style={{ textAlign: 'right', fontWeight: '700' }}>¥{mat.totalValue}万 ({mat.totalCount}個)</td></tr>
                  <tr><td>平均材料単価</td><td style={{ textAlign: 'right', color: 'var(--color-cyan)' }}>¥{mat.unitCost.toFixed(2)}万/個</td></tr>
                  <tr><td>当期材料投入 (コ)</td><td style={{ textAlign: 'right', color: 'var(--color-red)' }}>-¥{Math.round(mat.inputValue)}万 ({mat.inputCount}個)</td></tr>
                  <tr><td>火災損失（材料）</td><td style={{ textAlign: 'right', color: 'var(--color-red)' }}>-¥{Math.round(mat.fireValue)}万 ({mat.fireCount}個)</td></tr>
                  <tr style={{ borderTop: '1px solid var(--border-light)', fontWeight: '700' }}><td><strong>期末材料残高 (⑧)</strong></td><td style={{ textAlign: 'right', color: 'var(--color-green)' }}>¥{Math.round(mat.endingValue)}万 ({mat.endingCount}個)</td></tr>
                </tbody>
              </table>
            </div>

            {/* 仕掛品棚卸 & 完成 */}
            <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', padding: '16px', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--color-purple)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '10px', fontSize: '0.9rem' }}>
                ② 仕掛品在庫 (コ・サ)
              </h4>
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <tbody>
                  <tr><td>期首仕掛品残高</td><td style={{ textAlign: 'right' }}>¥{wip.beginningValue}万 ({wip.beginningCount}個)</td></tr>
                  <tr><td>当期投入材料費 (コ)</td><td style={{ textAlign: 'right' }}>+¥{Math.round(mat.inputValue)}万 ({mat.inputCount}個)</td></tr>
                  <tr><td>当期完成加工費 (サ)</td><td style={{ textAlign: 'right', color: 'var(--color-purple)' }}>+¥{wip.inputValue - mat.inputValue}万</td></tr>
                  <tr style={{ borderTop: '1px solid var(--border-light)' }}><td><strong>仕掛品合計</strong></td><td style={{ textAlign: 'right', fontWeight: '700' }}>¥{Math.round(wip.totalValue)}万 ({wip.totalCount}個)</td></tr>
                  <tr><td>平均仕掛品単価</td><td style={{ textAlign: 'right', color: 'var(--color-cyan)' }}>¥{wip.unitCost.toFixed(2)}万/個</td></tr>
                  <tr><td>当期完成製品原価 (サ)</td><td style={{ textAlign: 'right', color: 'var(--color-red)' }}>-¥{Math.round(wip.completedValue)}万 ({wip.completedCount}個)</td></tr>
                  <tr><td>製造ミス損失（仕掛）</td><td style={{ textAlign: 'right', color: 'var(--color-red)' }}>-¥{Math.round(wip.missValue)}万 ({wip.missCount}個)</td></tr>
                  <tr style={{ borderTop: '1px solid var(--border-light)', fontWeight: '700' }}><td><strong>期末仕掛残高 (⑯)</strong></td><td style={{ textAlign: 'right', color: 'var(--color-purple)' }}>¥{Math.round(wip.endingValue)}万 ({wip.endingCount}個)</td></tr>
                </tbody>
              </table>
            </div>

            {/* 製品棚卸 & 売上原価 */}
            <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-light)', padding: '16px', borderRadius: '12px' }}>
              <h4 style={{ color: 'var(--color-pink)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '10px', fontSize: '0.9rem' }}>
                ③ 製品在庫 (サ・売上)
              </h4>
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <tbody>
                  <tr><td>期首製品残高</td><td style={{ textAlign: 'right' }}>¥{prod.beginningValue}万 ({prod.beginningCount}個)</td></tr>
                  <tr><td>当期完成完成原価 (サ)</td><td style={{ textAlign: 'right' }}>+¥{Math.round(prod.completedValue)}万 ({prod.completedCount}個)</td></tr>
                  <tr style={{ borderTop: '1px solid var(--border-light)' }}><td><strong>製品合計</strong></td><td style={{ textAlign: 'right', fontWeight: '700' }}>¥{Math.round(prod.totalValue)}万 ({prod.totalCount}個)</td></tr>
                  <tr><td>平均製品単価 (製造原価)</td><td style={{ textAlign: 'right', color: 'var(--color-cyan)' }}>¥{prod.unitCost.toFixed(2)}万/個</td></tr>
                  <tr><td>当期売上原価 (vPQ)</td><td style={{ textAlign: 'right', color: 'var(--color-red)' }}>-¥{Math.round(prod.cogsValue)}万 ({prod.salesCount}個)</td></tr>
                  <tr><td>盗難損失（製品）</td><td style={{ textAlign: 'right', color: 'var(--color-red)' }}>-¥{Math.round(prod.theftValue)}万 ({prod.theftCount}個)</td></tr>
                  <tr style={{ borderTop: '1px solid var(--border-light)', fontWeight: '700' }}><td><strong>期末製品残高 (⑧)</strong></td><td style={{ textAlign: 'right', color: 'var(--color-pink)' }}>¥{Math.round(prod.endingValue)}万 ({prod.endingCount}個)</td></tr>
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {activeSubTab === 'cf' && (
        <div className="glass-card" style={{ margin: 0 }}>
          <div className="card-title-bar">
            <h3 className="card-title" style={{ color: 'var(--color-cyan)' }}>
              キャッシュフロー計算書 (C/F)
            </h3>
          </div>

          <table className="statement-table">
            <tbody>
              <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                <td><strong>I. 営業活動によるキャッシュフロー</strong></td>
                <td className="number-cell" style={{ color: cf.operatingCF >= 0 ? 'var(--color-cyan)' : 'var(--color-red)' }}>
                  ¥{Math.round(cf.operatingCF)}万
                </td>
              </tr>
              <tr><td className="indent-1">税引前当期純利益</td><td className="number-cell">¥{Math.round(pl.profitBeforeTax)}万</td></tr>
              <tr><td className="indent-1">減価償却費の足し戻し</td><td className="number-cell">¥{results.machines.depreciation}万</td></tr>
              <tr><td className="indent-1">売掛金の増減 (増はマイナス)</td><td className="number-cell">¥{Math.round(carryover.receivables - bs.receivables)}万</td></tr>
              <tr><td className="indent-1">材料在庫の増減</td><td className="number-cell">¥{Math.round(carryover.materialsValue - bs.materialsValue)}万</td></tr>
              <tr><td className="indent-1">仕掛品在庫の増減</td><td className="number-cell">¥{Math.round(carryover.wipValue - bs.wipValue)}万</td></tr>
              <tr><td className="indent-1">製品在庫の増減</td><td className="number-cell">¥{Math.round(carryover.productValue - bs.productValue)}万</td></tr>
              <tr><td className="indent-1">買掛金の増減 (増はプラス)</td><td className="number-cell">¥{Math.round(bs.payables - carryover.payables)}万</td></tr>
              <tr><td className="indent-1">法人税等の支払 (ニ)</td><td className="number-cell" style={{ color: 'var(--color-red)' }}>-¥{cf.operatingCF - (pl.profitBeforeTax + results.machines.depreciation + (carryover.receivables - bs.receivables) + (carryover.materialsValue - bs.materialsValue) + (carryover.wipValue - bs.wipValue) + (carryover.productValue - bs.productValue) + (bs.payables - carryover.payables))}万</td></tr>

              <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                <td><strong>II. 投資活動によるキャッシュフロー</strong></td>
                <td className="number-cell" style={{ color: cf.investingCF >= 0 ? 'var(--color-cyan)' : 'var(--color-red)' }}>
                  ¥{Math.round(cf.investingCF)}万
                </td>
              </tr>
              <tr><td className="indent-1">機械工具の新規購入 (ケ)</td><td className="number-cell" style={{ color: 'var(--color-red)' }}>-¥{results.machines.purchased}万</td></tr>
              <tr><td className="indent-1">機械工具売却 / 災害受取保険金</td><td className="number-cell">+¥{pl.extraordinaryGain}万</td></tr>

              <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                <td><strong>III. 財務活動によるキャッシュフロー</strong></td>
                <td className="number-cell" style={{ color: cf.financingCF >= 0 ? 'var(--color-cyan)' : 'var(--color-red)' }}>
                  ¥{Math.round(cf.financingCF)}万
                </td>
              </tr>
              <tr><td className="indent-1">資本金の増資 (カ)</td><td className="number-cell">¥{bs.capital - carryover.capital}万</td></tr>
              <tr><td className="indent-1">借入による収入 (オ)</td><td className="number-cell">¥{cf.financingCF - (bs.capital - carryover.capital) + (bs.loans - carryover.loan)}万</td></tr>
              <tr><td className="indent-1">借入金の返済支出 (ナ)</td><td className="number-cell" style={{ color: 'var(--color-red)' }}>-¥{bs.loans - carryover.loan}万</td></tr>

              <tr className="total-row" style={{ background: 'rgba(0, 242, 254, 0.05)' }}>
                <td><strong>当期キャッシュフロー純増減 (合計)</strong></td>
                <td className="number-cell" style={{ color: cf.totalCF >= 0 ? 'var(--color-cyan)' : 'var(--color-red)', fontSize: '1rem', fontWeight: '800' }}>
                  ¥{Math.round(cf.totalCF)}万
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

export default FinancialStatements;
