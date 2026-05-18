import React, { useState } from 'react';

function PeriodEndWizard({ players = [], commonPeriod = 1, carryover = {}, ledger = [], actuals = {}, onUpdateActuals, results }) {
  const [step, setStep] = useState(1); // 1: 事故棚卸, 2: 設備・人員確認, 3: 決算バランス確認, 4: 経営戦略レビューアリーナ
  const [reviewTab, setReviewTab] = useState('power'); // 'power': ビジネスパワー自己診断, 'mflac': MFLACレーダーチャート, 'matrix': マトリックス決算(第5表), 'trends': 時系列(第4表)
  const [selectedPlayerId, setSelectedPlayerId] = useState(0); // レビュー対象プレイヤー (デフォルト: 自分)

  const handleActualChange = (field, val) => {
    onUpdateActuals({
      ...actuals,
      [field]: Math.max(0, Number(val) || 0)
    });
  };

  // --------------------------------------------------------
  // 📋 1. ビジネスパワー自己診断 (各10点満点、合計100点) の計算
  // --------------------------------------------------------
  const calculateBusinessPower = (player) => {
    const pPeriod = player.currentPeriod;
    const pData = player.periods[pPeriod];
    if (!pData) return Array(10).fill(5);

    // プレイヤーの ledger/carryover から財務再計算
    const carry = pData.carryover || {};
    const led = pData.ledger || [];
    const act = pData.actuals || {};
    
    // 財務再計算用のヘルパー
    let totalCash = carry.cash || 0;
    let totalLoan = carry.loan || 0;
    let purchaseCount = 0;
    
    led.forEach(e => {
      if (e.category === 'オ') totalLoan += (Number(e.amount) || 0);
      if (e.category === 'ナ') totalLoan -= (Number(e.amount) || 0);
      if (e.category === 'ツ') purchaseCount += (Number(e.quantity) || 0);
    });

    const stats = player.stats || {
      totalDecisionTime: 0,
      decisionCount: 0,
      maxSingleSaleQty: 0,
      stockoutCount: 0,
      maxAdLevel: 0,
      maxRdLevel: 0
    };

    // 金融再計算
    const res = results || { bs: { totalNetAssets: 100, difference: 0 }, pl: { salesPrice: 20 }, inventory: { total: 0 } };
    const netAssets = res.bs ? res.bs.totalNetAssets : 100;

    // 1. 計数力: 決算の正確さ
    const score1 = res.bs && res.bs.difference === 0 ? 10 : 5;

    // 2. 決断力: 平均意思決定時間
    const avgTime = stats.decisionCount > 0 ? (stats.totalDecisionTime / stats.decisionCount) / 1000 : 6;
    let score2 = 5;
    if (avgTime <= 3) score2 = 10;
    else if (avgTime <= 5) score2 = 9;
    else if (avgTime <= 7) score2 = 8;
    else if (avgTime <= 10) score2 = 7;
    else if (avgTime <= 15) score2 = 5;
    else score2 = 3;

    // 3. 先見力: 累計仕入個数
    let score3 = 4;
    if (purchaseCount >= 15) score3 = 10;
    else if (purchaseCount >= 10) score3 = 8;
    else if (purchaseCount >= 5) score3 = 6;

    // 4. 大型力: 1回の最大販売個数
    const maxQty = stats.maxSingleSaleQty || 0;
    let score4 = 2;
    if (maxQty >= 8) score4 = 10;
    else if (maxQty >= 6) score4 = 8;
    else if (maxQty >= 4) score4 = 6;
    else if (maxQty >= 2) score4 = 4;

    // 5. 広告宣伝力: 赤チップ最大保有枚数
    const maxAd = stats.maxAdLevel || 0;
    let score5 = 2;
    if (maxAd >= 5) score5 = 10;
    else if (maxAd >= 3) score5 = 8;
    else if (maxAd >= 2) score5 = 6;
    else if (maxAd >= 1) score5 = 4;

    // 6. 研究開発力: 青チップ最大保有枚数
    const maxRd = stats.maxRdLevel || 0;
    let score6 = 2;
    if (maxRd >= 3) score6 = 10;
    else if (maxRd >= 2) score6 = 8;
    else if (maxRd >= 1) score6 = 6;

    // 7. バランス力: 機会損失・在庫ゼロペナルティ
    const stockouts = stats.stockoutCount || 0;
    const score7 = Math.max(2, 10 - stockouts * 2.5);

    // 8. 資金力: 期末純資産額 (自己資本)
    let score8 = 4;
    if (netAssets >= 250) score8 = 10;
    else if (netAssets >= 180) score8 = 8;
    else if (netAssets >= 120) score8 = 6;

    // 9. 価格力: 平均販売単価 P
    const avgP = res.pl ? res.pl.salesPrice || 0 : 20;
    let score9 = 4;
    if (avgP >= 28) score9 = 10;
    else if (avgP >= 25) score9 = 8;
    else if (avgP >= 22) score9 = 6;

    // 10. 成長力: 当期の自己資本成長率
    const initialAssets = carry.netAssets || 100;
    const growth = (netAssets / initialAssets) * 100;
    let score10 = 3;
    if (growth >= 150) score10 = 10;
    else if (growth >= 120) score10 = 8;
    else if (growth >= 100) score10 = 6;

    return [
      { name: "1. 計数力", value: score1, desc: "決算の正確さ・やり直し頻度" },
      { name: "2. 決断力", value: score2, desc: "手番での平均思考の速さ" },
      { name: "3. 先見力", value: score3, desc: "材料の先回り仕入れ・機会創出" },
      { name: "4. 大型力", value: score4, desc: "1回あたりの最大売上個数" },
      { name: "5. 広告宣伝力", value: score5, desc: "赤チップ投資による販売力増強" },
      { name: "6. 研究開発力", value: score6, desc: "青チップ投資による価格強み" },
      { name: "7. バランス力", value: score7, desc: "デッドロック(在庫ゼロ)の回避度" },
      { name: "8. 資金力", value: score8, desc: "自己資本額・融資依存度" },
      { name: "9. 価格力", value: score9, desc: "平均販売価格の高付加価値性" },
      { name: "10. 成長力", value: score10, desc: "期首から期末への自己資本伸長率" }
    ];
  };

  // --------------------------------------------------------
  // 📊 2. MFLAC 5段階評価 (各5点満点) の計算
  // --------------------------------------------------------
  const calculateMflac = (player) => {
    const pPeriod = player.currentPeriod;
    const pData = player.periods[pPeriod];
    if (!pData) return { scores: Array(5).fill(3), values: {} };

    const carry = pData.carryover || {};
    const led = pData.ledger || [];
    
    // B/S, P/L の簡略シミュレート (または親から受け取った results から参照)
    // ここでは、各プレイヤー向けに results と同等の計算を行うか、
    // 自社以外のNPCには carryover & ledger から簡易計算を施します
    let loan = carry.loan || 0;
    let cash = carry.cash || 0;
    led.forEach(e => {
      if (e.category === 'オ') loan += (Number(e.amount) || 0);
      if (e.category === 'ナ') loan -= (Number(e.amount) || 0);
    });

    const res = results || { bs: { totalAssets: 200, totalNetAssets: 100, cash: 100 }, pl: { sales: 150, marginalProfit: 90, fixedCosts: 60, netProfit: 30 }, inventory: { total: 0 }, machines: { depreciation: 10 } };
    
    // 5つの指標の算出
    const sales = res.pl.sales || 1;
    const marginalProfit = res.pl.marginalProfit || 0;
    const fixedCosts = res.pl.fixedCosts || 0;
    const totalAssets = res.bs.totalAssets || 1;
    const totalNetAssets = res.bs.totalNetAssets || 1;
    const depreciation = res.machines.depreciation || 0;
    const netProfit = res.pl.netProfit || 0;
    const cashBalance = res.bs.cash || 0;
    const totalInventory = res.inventory.total || 0;

    // M: 限界利益率
    const mRate = (marginalProfit / sales) * 100;
    let scoreM = 1;
    if (mRate >= 70) scoreM = 5;
    else if (mRate >= 60) scoreM = 4;
    else if (mRate >= 50) scoreM = 3;
    else if (mRate >= 30) scoreM = 2;

    // F: 損益分岐点比率
    const fRate = marginalProfit > 0 ? (fixedCosts / marginalProfit) * 100 : 150;
    let scoreF = 1;
    if (fRate <= 50) scoreF = 5;
    else if (fRate <= 70) scoreF = 4;
    else if (fRate <= 90) scoreF = 3;
    else if (fRate <= 100) scoreF = 2;

    // L: 有利子負債キャッシュフロー比率
    const cf = netProfit + depreciation;
    let scoreL = 5; // 無借入なら 5点
    if (loan > 0) {
      if (cf <= 0) scoreL = 1;
      else {
        const lRatio = loan / cf;
        if (lRatio <= 2.0) scoreL = 5;
        else if (lRatio <= 4.0) scoreL = 4;
        else if (lRatio <= 6.0) scoreL = 3;
        else if (lRatio <= 8.0) scoreL = 2;
        else scoreL = 1;
      }
    }

    // A: 総資産回転率
    const turnover = sales / totalAssets;
    let scoreA = 1;
    if (turnover >= 2.0) scoreA = 5;
    else if (turnover >= 1.4) scoreA = 4;
    else if (turnover >= 0.8) scoreA = 3;
    else if (turnover >= 0.4) scoreA = 2;

    // C: 運転資金比率
    const realCash = cashBalance - loan;
    const wc = totalInventory; // 売掛金と買掛金は0のため棚卸資産のみ
    let scoreC = 5;
    if (wc > 0) {
      const cRatio = realCash / wc;
      if (cRatio >= 3.0) scoreC = 5;
      else if (cRatio >= 2.0) scoreC = 4;
      else if (cRatio >= 1.0) scoreC = 3;
      else if (cRatio >= 0.5) scoreC = 2;
      else scoreC = 1;
    }

    return {
      scores: [
        { key: 'M', name: 'M (限界利益率)', score: scoreM, val: `${mRate.toFixed(0)}%` },
        { key: 'F', name: 'F (損益分岐点比率)', score: scoreF, val: `${fRate.toFixed(0)}%` },
        { key: 'L', name: 'L (負債CF比率)', score: scoreL, val: loan > 0 ? `${(loan/Math.max(1, cf)).toFixed(1)}期` : '無借入' },
        { key: 'A', name: 'A (総資産回転率)', score: scoreA, val: `${turnover.toFixed(2)}回` },
        { key: 'C', name: 'C (運転資金比率)', score: scoreC, val: wc > 0 ? `${(realCash/wc).toFixed(1)}倍` : '在庫ゼロ' }
      ]
    };
  };

  // --------------------------------------------------------
  // 🧾 3. マトリックス決算シート (第5表) の自動仕訳プロット
  // --------------------------------------------------------
  const getMatrixRows = () => {
    // 縦軸（勘定科目）の定義に対応する金額を ledger からマッピング
    const matrix = {
      'イ': { name: '現預金(出)', category: '現預金', val: 0 },
      'ウ': { name: '貸付金', category: '貸付金', val: 0 },
      'エ': { name: '機械工具', category: '固定資産', val: 0 },
      'オ': { name: '投入費(仕掛)', category: '仕掛品', val: 0 },
      'カ': { name: '完成費(製品)', category: '製品', val: 0 },
      'キ': { name: '労務費', category: '労務費', val: 0 },
      'ク': { name: '製造経費', category: '製造固定費', val: 0 },
      'ケ': { name: '減価償却費', category: '償却費', val: 0 },
      'コ': { name: '販売費', category: '販売費', val: 0 },
      'サ': { name: '一般管理費', category: '管理費', val: 0 },
      'シ': { name: '営業外費用', category: '営業外', val: 0 },
      'ス': { name: '研究開発費', category: '研究費', val: 0 },
    };

    ledger.forEach(e => {
      if (matrix[e.category]) {
        matrix[e.category].val += (Number(e.amount) || 0);
      }
    });

    return Object.values(matrix);
  };

  const activePlayer = players.find(p => p.id === selectedPlayerId) || players[0];
  const powerStats = calculateBusinessPower(activePlayer);
  const mflacStats = calculateMflac(activePlayer);

  // ビジネスパワー合計点数
  const totalPowerScore = powerStats.reduce((sum, item) => sum + item.value, 0) * 2;

  // AIコンサルタントによる動的コメント生成
  const getAiAdvisorComment = () => {
    const avgSpeed = activePlayer.stats ? (activePlayer.stats.totalDecisionTime / Math.max(1, activePlayer.stats.decisionCount)) / 1000 : 0;
    const isFast = avgSpeed < 5 && avgSpeed > 0;
    const isInvestor = (activePlayer.stats?.maxAdLevel || 0) >= 3 || (activePlayer.stats?.maxRdLevel || 0) >= 2;
    const netProfit = results.pl ? results.pl.netProfit : 0;
    const isProfitable = netProfit > 0;

    if (isProfitable && isInvestor) {
      return "🏆 【積極投資ハイパフォーマンス型】積極的な広告・研究開発投資を行いながら、見事黒字決算を達成されました！戦略的な意思決定と付加価値創出力が極めて高水準です。次期もこの優位性を維持し、市場を圧倒しましょう！";
    }
    if (isProfitable && isFast) {
      return "⚡ 【俊敏型高収益経営者】圧倒的な意思決定の速さと正確性を両立し、効率よく限界利益を稼ぎ出しています！デッドロックを完全に回避したスマートな在庫回転はお見事です。";
    }
    if (!isProfitable && isInvestor) {
      return "⚠️ 【投資先行デッドロック警戒型】研究開発や広告に多大な投資を行っていますが、固定費の重みや在庫バランスの崩れ（デッドロック）が限界利益を圧迫して赤字を招いています。次期は仕入・投入ラインを再整理し、回転数を高めることに集中してください。";
    }
    return "💡 【堅実安定型経営】極めて手堅く手堅く経営されていますが、利益の最大化（PQの拡大）に向けた『大型販売』や『広告・研究チップ投資』にまだ踏み込めていません。次期は少しリスクを取って大型設備投資やセールスマン補強を行い、P（単価）とQ（数量）の両輪を大きく回してみましょう！";
  };

  // --------------------------------------------------------
  // SVG レーダーチャートの描画用座標算出 (MFLAC)
  // --------------------------------------------------------
  const renderMflacRadar = () => {
    const size = 300;
    const center = size / 2;
    const radius = 95;
    
    // M, F, L, A, C の順で五角形を形成 (角度)
    const angles = [-Math.PI/2, -Math.PI/2 + (Math.PI*2/5), -Math.PI/2 + (Math.PI*2/5)*2, -Math.PI/2 + (Math.PI*2/5)*3, -Math.PI/2 + (Math.PI*2/5)*4];
    
    // グリッド同心円 (1点〜5点)
    const grids = [1, 2, 3, 4, 5];
    
    // 五角形の頂点座標
    const getCoordinates = (index, value) => {
      const angle = angles[index];
      const r = (value / 5) * radius;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle)
      };
    };

    // プレイヤーのプロットポイント
    const points = mflacStats.scores.map((s, idx) => getCoordinates(idx, s.score));
    const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto' }}>
        {/* 背景グリッド五角形 */}
        {grids.map(g => {
          const gridPoints = angles.map((a, idx) => {
            const r = (g / 5) * radius;
            return `${center + r * Math.cos(a)},${center + r * Math.sin(a)}`;
          }).join(' ');
          return (
            <polygon 
              key={g} 
              points={gridPoints} 
              fill="none" 
              stroke="rgba(255,255,255,0.08)" 
              strokeWidth="1"
            />
          );
        })}

        {/* 放射線 */}
        {angles.map((a, idx) => (
          <line 
            key={idx} 
            x1={center} 
            y1={center} 
            x2={center + radius * Math.cos(a)} 
            y2={center + radius * Math.sin(a)} 
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}

        {/* MFLAC プロット領域 */}
        <polygon 
          points={pointsStr} 
          fill="rgba(0, 242, 254, 0.18)" 
          stroke="var(--color-cyan)" 
          strokeWidth="2.5"
          filter="drop-shadow(0 0 6px rgba(0, 242, 254, 0.5))"
        />

        {/* 各プロット頂点ドット */}
        {points.map((p, idx) => (
          <circle 
            key={idx} 
            cx={p.x} 
            cy={p.y} 
            r="4.5" 
            fill="#fff" 
            stroke="var(--color-cyan)" 
            strokeWidth="2"
          />
        ))}

        {/* ラベル描画 */}
        {mflacStats.scores.map((s, idx) => {
          const angle = angles[idx];
          const offset = 18;
          const labelX = center + (radius + offset) * Math.cos(angle);
          const labelY = center + (radius + offset) * Math.sin(angle) + 4;
          const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
          
          return (
            <text 
              key={idx} 
              x={labelX} 
              y={labelY} 
              fill="#fff" 
              fontSize="0.72rem" 
              fontWeight="bold"
              textAnchor={anchor}
            >
              {s.key}
            </text>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="glass-card" style={{ border: '1px solid rgba(0, 242, 254, 0.15)', boxShadow: '0 0 25px rgba(0, 242, 254, 0.05)' }}>
      <div className="card-title-bar" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '15px' }}>
        <h3 className="card-title" style={{ color: 'var(--color-cyan)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏁 期末決算処理 ＆ 経営戦略レビューアリーナ
        </h3>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>決算の監査完了と、MFLAC経営戦略レーダーチャートによる自己分析レビューを行います。</span>
      </div>

      {/* ステップインジケーター */}
      <div className="wizard-step-indicator" style={{ margin: '20px 0' }}>
        <div className={`wizard-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>1</div>
        <div className={`wizard-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>2</div>
        <div className={`wizard-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>3</div>
        <div className={`wizard-step ${step === 4 ? 'active' : ''}`}>4</div>
      </div>

      {/* ステップ 1: 事故棚卸 */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.95rem', color: '#fff' }}>ステップ 1: 実地棚卸と事故災害損失の入力</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              今期中にゲーム内で発生した「火災」「製造ミス（ロスト）」「盗難」の個数を入力してください。
              これらは在庫評価から除外され、<strong>特別損失（災害損失）</strong>として自動計上されます。
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            <div className="form-group" style={{ background: 'rgba(255, 56, 56, 0.03)', border: '1px solid rgba(255, 56, 56, 0.15)', padding: '15px', borderRadius: '10px' }}>
              <label style={{ color: 'var(--color-red)', fontWeight: 'bold', fontSize: '0.85rem' }}>🔥 火災 (材料個数)</label>
              <input 
                type="number" 
                className="form-input" 
                value={actuals.fireCount || 0}
                onChange={(e) => handleActualChange('fireCount', e.target.value)}
                min="0"
                style={{ marginTop: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                損失額: ¥{Math.round(results.mat.fireValue)}万円
              </span>
            </div>

            <div className="form-group" style={{ background: 'rgba(155, 81, 224, 0.03)', border: '1px solid rgba(155, 81, 224, 0.15)', padding: '15px', borderRadius: '10px' }}>
              <label style={{ color: 'var(--color-purple)', fontWeight: 'bold', fontSize: '0.85rem' }}>💥 製造ミス (仕掛品個数)</label>
              <input 
                type="number" 
                className="form-input" 
                value={actuals.missCount || 0}
                onChange={(e) => handleActualChange('missCount', e.target.value)}
                min="0"
                style={{ marginTop: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                損失額: ¥{Math.round(results.wip.missValue)}万円
              </span>
            </div>

            <div className="form-group" style={{ background: 'rgba(255, 0, 127, 0.03)', border: '1px solid rgba(255, 0, 127, 0.15)', padding: '15px', borderRadius: '10px' }}>
              <label style={{ color: 'var(--color-pink)', fontWeight: 'bold', fontSize: '0.85rem' }}>🕵️ 盗難 (製品個数)</label>
              <input 
                type="number" 
                className="form-input" 
                value={actuals.theftCount || 0}
                onChange={(e) => handleActualChange('theftCount', e.target.value)}
                min="0"
                style={{ marginTop: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
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
            <h4 style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.95rem', color: '#fff' }}>ステップ 2: 生産設備と人員の期末監査</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              期末時点での工場の「機械台数」と「社員数」が、期首繰越＋今期取引（ケでの購入等）と一致しているか確認します。
              これに基づき、<strong>減価償却費</strong>および<strong>労務費（社員の人件費）</strong>の計算が行われます。
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '10px' }}>
              <h5 style={{ color: 'var(--color-purple)', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 'bold' }}>🤖 機械工具の減価償却チェック</h5>
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
              <h5 style={{ color: 'var(--color-cyan)', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 'bold' }}>👤 人員構成チェック</h5>
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
            <button className="btn" onClick={() => setStep(1)} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
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
            <h4 style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.95rem', color: '#fff' }}>ステップ 3: 決算バランス監査 (監査完了)</h4>
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
                今期の最終純利益: <strong style={{ color: 'var(--color-cyan)', fontSize: '0.95rem' }}>¥{Math.round(results.pl.netProfit)}万円</strong>
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
            <button className="btn" onClick={() => setStep(2)} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
              ⬅️ 戻る
            </button>
            
            {results.bs.difference === 0 && (
              <button className="btn btn-primary" onClick={() => setStep(4)} style={{ background: 'linear-gradient(135deg, var(--color-cyan), var(--color-purple))', border: 'none', color: '#000', fontWeight: 'bold' }}>
                🏆 経営戦略レビューアリーナを開く ➡️
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: 🏆 経営戦略レビューアリーナ (ビジネスパワー分析 ＆ MFLAC) */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* レビュー対象プレイヤーのトグル切り替え */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>📊 レビューするプレイヤーを選択:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {players.map(p => (
                <button 
                  key={p.id}
                  onClick={() => setSelectedPlayerId(p.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    border: '1px solid',
                    borderColor: selectedPlayerId === p.id ? p.color : 'rgba(255,255,255,0.1)',
                    background: selectedPlayerId === p.id ? `${p.color}20` : 'transparent',
                    color: selectedPlayerId === p.id ? p.color : '#fff',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* サブタブ (ビジネスパワー、MFLAC、第5表、推移) */}
          <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
            <button 
              className={`tab-btn ${reviewTab === 'power' ? 'active' : ''}`}
              onClick={() => setReviewTab('power')}
              style={{ fontSize: '0.8rem', padding: '6px 12px', background: reviewTab === 'power' ? 'rgba(0, 242, 254, 0.1)' : 'transparent', color: reviewTab === 'power' ? 'var(--color-cyan)' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              📋 自己診断シート (ビジネスパワー)
            </button>
            <button 
              className={`tab-btn ${reviewTab === 'mflac' ? 'active' : ''}`}
              onClick={() => setReviewTab('mflac')}
              style={{ fontSize: '0.8rem', padding: '6px 12px', background: reviewTab === 'mflac' ? 'rgba(0, 242, 254, 0.1)' : 'transparent', color: reviewTab === 'mflac' ? 'var(--color-cyan)' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              📊 MFLAC レーダーチャート
            </button>
            <button 
              className={`tab-btn ${reviewTab === 'matrix' ? 'active' : ''}`}
              onClick={() => setReviewTab('matrix')}
              style={{ fontSize: '0.8rem', padding: '6px 12px', background: reviewTab === 'matrix' ? 'rgba(0, 242, 254, 0.1)' : 'transparent', color: reviewTab === 'matrix' ? 'var(--color-cyan)' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              🧾 マトリックス決算シート (第5表)
            </button>
          </div>

          {/* 4-1. 自己診断シート (ビジネスパワー分析) */}
          {reviewTab === 'power' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
              
              {/* スコアテーブル */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h5 style={{ fontSize: '0.85rem', color: 'var(--color-yellow)', marginBottom: '10px', fontWeight: 'bold' }}>ビジネスパワー分析スコアシート</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {powerStats.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <div>
                        <strong style={{ color: '#fff' }}>{item.name}</strong>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>({item.desc})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '80px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${item.value * 10}%`, height: '100%', background: item.value >= 8 ? 'var(--color-green)' : item.value >= 5 ? 'var(--color-cyan)' : 'var(--color-red)' }}></div>
                        </div>
                        <strong style={{ color: 'var(--color-yellow)', width: '35px', textAlign: 'right' }}>{item.value} 点</strong>
                      </div>
                    </div>
                  ))}
                  
                  {/* 合計得点 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '5px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#fff' }}>総合ビジネスパワー得点 (100点満点)</span>
                    <strong style={{ fontSize: '1.2rem', color: 'var(--color-yellow)' }}>{totalPowerScore} 点 / 100</strong>
                  </div>
                </div>
              </div>

              {/* レーダーチャート & 参謀コンサルコメント */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'space-between' }}>
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {/* ビジネスパワー簡易レーダー（五角形ベースにモディファイして描画） */}
                  {renderMflacRadar()}
                </div>
                
                {/* AI Advisor Comment */}
                <div style={{ background: 'rgba(0, 242, 254, 0.04)', border: '1px solid rgba(0, 242, 254, 0.15)', padding: '12px 15px', borderRadius: '10px', fontSize: '0.78rem', color: '#fff', lineHeight: '1.45' }}>
                  <strong style={{ color: 'var(--color-cyan)', display: 'block', marginBottom: '5px' }}>🧙‍♂️ 参謀AIコンサルタントからの当期総括:</strong>
                  {getAiAdvisorComment()}
                </div>
              </div>
            </div>
          )}

          {/* 4-2. MFLAC レーダーチャート */}
          {reviewTab === 'mflac' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
              
              {/* 五角形レーダーチャート */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderMflacRadar()}
              </div>

              {/* MFLAC スコア内訳 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h5 style={{ fontSize: '0.85rem', color: 'var(--color-cyan)', fontWeight: 'bold' }}>
                  MFLAC バランス会計レーダー基準値分析 ({activePlayer.name})
                </h5>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  ※限界利益率、損益分岐点、負債比率、総資産回転率、運転資金比率の5指標について、公式MG基準（1〜5点）でマッピングされています。
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '5px' }}>
                  {mflacStats.scores.map((s, idx) => (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: '#fff' }}>{s.name}</strong>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>実績値: {s.val}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div 
                            key={i} 
                            style={{ 
                              width: '12px', 
                              height: '12px', 
                              borderRadius: '2px', 
                              background: i < s.score ? 'var(--color-cyan)' : 'rgba(255,255,255,0.08)',
                              boxShadow: i < s.score ? '0 0 4px var(--color-cyan)' : 'none'
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4-3. マトリックス決算シート (第5表) */}
          {reviewTab === 'matrix' && (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h5 style={{ fontSize: '0.85rem', color: 'var(--color-purple)', marginBottom: '10px', fontWeight: 'bold' }}>
                🧾 デジタルマトリックス決算シート (第5表 - 簡易仕訳対照表)
              </h5>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', color: '#fff', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>記号</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>勘定科目</th>
                      <th style={{ padding: '8px' }}>当期取引合計額</th>
                      <th style={{ padding: '8px' }}>会計区分</th>
                      <th style={{ padding: '8px' }}>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getMatrixRows().map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: 'var(--color-yellow)' }}>{Object.keys(row)[0] || '・'}</td>
                        <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>{row.name}</td>
                        <td style={{ padding: '8px', color: 'var(--color-cyan)', fontWeight: 'bold' }}>¥{row.val}万</td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{row.category}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: '0.65rem', background: row.val > 0 ? 'rgba(5, 255, 161, 0.1)' : 'rgba(255,255,255,0.03)', color: row.val > 0 ? 'var(--color-green)' : 'var(--text-muted)', padding: '2px 6px', borderRadius: '3px' }}>
                            {row.val > 0 ? '稼働' : '不稼働'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '15px', marginTop: '10px' }}>
            <button className="btn" onClick={() => setStep(3)} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
              ⬅️ 決算監査へ戻る
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
              💡 このレビュー結果をスプレッドシートやCSVへエクスポートできます！
            </span>
          </div>
        </div>
      )}

    </div>
  );
}

export default PeriodEndWizard;
