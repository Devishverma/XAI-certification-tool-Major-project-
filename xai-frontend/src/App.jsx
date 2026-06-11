import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import SetupPanel from './components/SetupPanel';
import AuditTab from './components/AuditTab';
import ExplainTab from './components/ExplainTab';
import MitigationsTab from './components/MitigationsTab';
import CertificateTab from './components/CertificateTab';

function App() {
  const [activeTab, setActiveTab] = useState('audit-tab');
  const [theme, setTheme] = useState('dark');
  const [trainingStats, setTrainingStats] = useState(null);
  const [auditMetrics, setAuditMetrics] = useState(null);
  const [auditRunId, setAuditRunId] = useState(0);  // increments on every audit run
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  useEffect(() => {
    document.body.className = `${theme}-theme`;
    // Fire resize event when tab changes so Plotly charts render correctly
    window.dispatchEvent(new Event('resize'));
  }, [theme, activeTab]);

  const handleTrainAndAudit = async (formData, isUpload) => {
    setIsLoading(true);
    setLoadingMessage(isUpload ? "Applying model and running audits..." : "Training classifier and running audits...");
    try {
      const trainRes = await fetch('http://localhost:8000/api/model/train', {
        method: 'POST',
        body: formData
      });
      const trainData = await trainRes.json();
      if (!trainRes.ok) throw new Error(trainData.detail || "Training failed");
      
      setTrainingStats(trainData.training);
      
      const auditRes = await fetch('http://localhost:8000/api/audit');
      const auditData = await auditRes.json();
      if (!auditRes.ok) throw new Error("Audit failed");
      
      setAuditMetrics(auditData.metrics);
      setAuditRunId(prev => prev + 1);  // always force ExplainTab to re-fetch
      setActiveTab('audit-tab');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        theme={theme} 
        setTheme={setTheme} 
      />
      <main className="main-content">
        <header className="top-nav">
            <div className="header-title">
                <h2>Explainable AI Certification Dashboard</h2>
                <p>Audit machine learning models for fairness, compliance, and explainability</p>
            </div>
            <div className="model-meta-badges">
                <div className="meta-badge" id="badgeModelType">
                    <i className="fa-solid fa-microchip"></i>
                    <span>Model: {trainingStats ? (trainingStats.source === 'uploaded' ? 'Uploaded Model' : (trainingStats.model_type === 'random_forest' ? 'Random Forest' : 'Logistic Regression')) : 'Not Trained'}</span>
                </div>
                <div className="meta-badge" id="badgeAccuracy">
                    <i className="fa-solid fa-bullseye"></i>
                    <span>Accuracy: {trainingStats ? (trainingStats.accuracy * 100).toFixed(1) + '%' : '--'}</span>
                </div>
                <div className={`meta-badge ${auditMetrics ? (['GOLD', 'SILVER'].includes(auditMetrics.certification_level) ? 'pass' : (auditMetrics.certification_level === 'BRONZE' ? 'warning' : 'fail')) : ''}`}>
                    <i className="fa-solid fa-medal"></i>
                    <span>Rating: {auditMetrics ? auditMetrics.certification_level : '--'}</span>
                </div>
            </div>
        </header>

        <div className="content-grid">
          <SetupPanel onTrain={handleTrainAndAudit} setIsLoading={setIsLoading} setLoadingMessage={setLoadingMessage} />
          
          <section className="dashboard-panels">
            <div className={`tab-content ${activeTab === 'audit-tab' ? 'active' : ''}`} style={{display: activeTab === 'audit-tab' ? 'block' : 'none'}}>
              <AuditTab metrics={auditMetrics} theme={theme} />
            </div>
            <div className={`tab-content ${activeTab === 'explain-tab' ? 'active' : ''}`} style={{display: activeTab === 'explain-tab' ? 'block' : 'none'}}>
              <ExplainTab metrics={auditMetrics} theme={theme} auditRunId={auditRunId} />
            </div>
            <div className={`tab-content ${activeTab === 'recommendations-tab' ? 'active' : ''}`} style={{display: activeTab === 'recommendations-tab' ? 'block' : 'none'}}>
              <MitigationsTab metrics={auditMetrics} />
            </div>
            <div className={`tab-content ${activeTab === 'certificate-tab' ? 'active' : ''}`} style={{display: activeTab === 'certificate-tab' ? 'block' : 'none'}}>
              <CertificateTab metrics={auditMetrics} trainingStats={trainingStats} target={"Income"} sensitive={"Gender"} />
            </div>
          </section>
        </div>
      </main>

      {isLoading && (
        <div className="loader-overlay" id="loaderOverlay">
            <div className="loader-container">
                <div className="spinner"></div>
                <p>{loadingMessage}</p>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;
