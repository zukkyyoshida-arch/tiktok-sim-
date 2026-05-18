import React, { useState, useEffect } from 'react';
import { calculateFinancials, DEFAULT_PERIOD_DATA } from './utils/calculations';
import CashLedger from './components/CashLedger';
import FinancialStatements from './components/FinancialStatements';
import PeriodEndWizard from './components/PeriodEndWizard';
import ManagementPlan from './components/ManagementPlan';
import PriorPeriodCarryover from './components/PriorPeriodCarryover';

function App() {
  // テーマの状態 (ダーク / ライト)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('mg_theme');
    return saved || 'dark';
  });

  // 全期 (1期〜5期) のデータ管理
  const [periods, setPeriods] = useState(() => {
    const saved = localStorage.getItem('mg_periods_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse periods data", e);
      }
    }
    // 初期データ
    return {
      1: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      2: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      3: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      4: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
      5: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA))
    };
  });

  // 現在の期 (1〜5)
  const [currentPeriod, setCurrentPeriod] = useState(() => {
    const saved = localStorage.getItem('mg_current_period');
    return saved ? Number(saved) : 1;
  });

  // アクティブなタブ (ledger, statements, periodEnd, plan, settings)
  const [activeTab, setActiveTab] = useState('ledger');

  // データ変更時に localStorage に保存
  useEffect(() => {
    localStorage.setItem('mg_periods_data', JSON.stringify(periods));
  }, [periods]);

  useEffect(() => {
    localStorage.setItem('mg_current_period', String(currentPeriod));
  }, [currentPeriod]);

  // テーマ切り替え処理
  useEffect(() => {
    const body = document.body;
    if (theme === 'light') {
      body.classList.add('light-theme');
    } else {
      body.classList.remove('light-theme');
    }
    localStorage.setItem('mg_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 現在の期のデータを取得
  const currentData = periods[currentPeriod] || JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA));

  // リアルタイム財務計算を実行
  const results = calculateFinancials(currentData.carryover, currentData.ledger, currentData.actuals);

  // データの更新関数群
  const updatePeriodData = (field, newData) => {
    setPeriods(prev => ({
      ...prev,
      [currentPeriod]: {
        ...prev[currentPeriod],
        [field]: newData
      }
    }));
  };

  // 全期リセット機能
  const resetAllData = () => {
    if (window.confirm("全てのデータを初期化して最初から開始しますか？\n（この操作は取り消せません）")) {
      const freshData = {
        1: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
        2: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
        3: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
        4: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA)),
        5: JSON.parse(JSON.stringify(DEFAULT_PERIOD_DATA))
      };
      setPeriods(freshData);
      setCurrentPeriod(1);
      setActiveTab('ledger');
    }
  };

  // 前期の期末決算データから今期の期首データ（繰越）を自動引き継ぎ
  const rollForwardFromPrevious = () => {
    if (currentPeriod <= 1) return;
    const prevPeriod = currentPeriod - 1;
    const prevData = periods[prevPeriod];
    if (!prevData) return;

    // 前期の決算計算結果を取得
    const prevResults = calculateFinancials(prevData.carryover, prevData.ledger, prevData.actuals);

    const prevBS = prevResults.bs;
    const prevMat = prevResults.mat;
    const prevWip = prevResults.wip;
    const prevProd = prevResults.prod;
    const prevMach = prevResults.machines;

    // B/S残高を引き継ぎ
    const nextCarryover = {
      cash: prevBS.cash,
      materialsCount: prevMat.endingCount,
      materialsValue: prevMat.endingValue,
      wipCount: prevWip.endingCount,
      wipValue: prevWip.endingValue,
      productCount: prevProd.endingCount,
      productValue: prevProd.endingValue,
      largeMachines: prevMach.large, // 機械数も引き継ぎ
      smallMachines: prevMach.small,
      attachments: prevMach.attachments,
      machinesCount: prevMach.large + prevMach.small,
      machinesValue: prevBS.fixedAssets,
      loan: prevBS.loans,
      receivables: prevBS.receivables,
      payables: prevBS.payables,
      retainedEarnings: prevBS.retainedEarnings,
      capital: prevBS.capital
    };

    if (window.confirm(`第${prevPeriod}期末の決算データ（現金: ¥${prevBS.cash}万、純資産: ¥${prevBS.totalNetAssets}万）を、第${currentPeriod}期の期首データとして自動引き継ぎしますか？`)) {
      setPeriods(prev => ({
        ...prev,
        [currentPeriod]: {
          ...prev[currentPeriod],
          carryover: nextCarryover,
          actuals: {
            ...prev[currentPeriod].actuals,
            actualCash: prevBS.cash,
            actualMaterials: prevMat.endingCount,
            actualWip: prevWip.endingCount,
            actualProduct: prevProd.endingCount
          }
        }
      }));
      alert(`第${currentPeriod}期の期首データを自動設定しました！「設定」タブから内訳を確認・修正できます。`);
    }
  };

  return (
    <div className="phone-shell">
      {/* アプリ共通ヘッダー */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="badge badge-pink" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
            第{currentPeriod}期
          </div>
          <span className="app-title">戦略MG 製造業</span>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={toggleTheme} className="theme-switch" aria-label="Toggle theme">
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707-.707m12.728 0l-.707.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 01-8 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* アプリコンテンツ（スクロール可能） */}
      <main className="app-content">
        {activeTab === 'ledger' && (
          <div className="tab-panel">
            <CashLedger 
              carryover={currentData.carryover}
              ledger={currentData.ledger} 
              onUpdateLedger={(newLedger) => updatePeriodData('ledger', newLedger)}
              results={results}
            />
          </div>
        )}
        
        {activeTab === 'statements' && (
          <div className="tab-panel">
            <FinancialStatements 
              results={results} 
              carryover={currentData.carryover}
            />
          </div>
        )}

        {activeTab === 'periodEnd' && (
          <div className="tab-panel">
            <PeriodEndWizard 
              carryover={currentData.carryover}
              ledger={currentData.ledger}
              actuals={currentData.actuals}
              onUpdateActuals={(newActuals) => updatePeriodData('actuals', newActuals)}
              results={results}
            />
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="tab-panel">
            <ManagementPlan 
              budget={currentData.budget}
              carryover={currentData.carryover}
              onUpdateBudget={(newBudget) => updatePeriodData('budget', newBudget)}
              results={results}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-panel">
            <PriorPeriodCarryover 
              carryover={currentData.carryover}
              onUpdateCarryover={(newCarryover) => updatePeriodData('carryover', newCarryover)}
              currentPeriod={currentPeriod}
              periods={periods}
              setCurrentPeriod={setCurrentPeriod}
              rollForwardFromPrevious={rollForwardFromPrevious}
              resetAllData={resetAllData}
            />
          </div>
        )}
      </main>

      {/* スマホ用ボトムナビゲーション */}
      <nav className="bottom-nav">
        <button 
          onClick={() => setActiveTab('ledger')} 
          className={`nav-item ${activeTab === 'ledger' ? 'active' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          出納帳
        </button>

        <button 
          onClick={() => setActiveTab('statements')} 
          className={`nav-item ${activeTab === 'statements' ? 'active' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
          </svg>
          決算書
        </button>

        <button 
          onClick={() => setActiveTab('periodEnd')} 
          className={`nav-item ${activeTab === 'periodEnd' ? 'active' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          期末処理
        </button>

        <button 
          onClick={() => setActiveTab('plan')} 
          className={`nav-item ${activeTab === 'plan' ? 'active' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          計画表
        </button>

        <button 
          onClick={() => setActiveTab('settings')} 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          設定
        </button>
      </nav>
    </div>
  );
}

export default App;
