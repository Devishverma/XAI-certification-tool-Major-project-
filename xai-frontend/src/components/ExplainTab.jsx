import React, { useState, useEffect } from 'react';
import PlotComponent from 'react-plotly.js';
const Plot = PlotComponent.default || PlotComponent;

function ExplainTab({ metrics, theme, auditRunId }) {
  const [globalImportances, setGlobalImportances] = useState([]);
  const [samples, setSamples] = useState([]);
  const [activeRow, setActiveRow] = useState(null);
  const [localExplanation, setLocalExplanation] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [explainMethod, setExplainMethod] = useState('lime');

  useEffect(() => {
    if (metrics) {
      fetchGlobal();
      fetchSamples();
      setActiveRow(null);         // Reset selected row
      setLocalExplanation(null);  // Clear old local explanation
    }
  }, [metrics, auditRunId]);  // auditRunId guarantees re-fetch on every new audit

  const fetchGlobal = async () => {
    setGlobalImportances([]);  // Clear old chart first so it visibly reloads
    try {
      const cacheBust = `?t=${Date.now()}`;
      const res = await fetch(`http://localhost:8000/api/explain/global${cacheBust}`);
      const data = await res.json();
      if (res.ok) setGlobalImportances([...data.importances].reverse());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSamples = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/dataset/samples?limit=15');
      const data = await res.json();
      if (res.ok) setSamples(data.samples);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLocal = async (index, method) => {
    setLocalLoading(true);
    setLocalExplanation(null);
    try {
      const endpoint = method === 'shap' ? `/api/explain/local/shap/${index}` : `/api/explain/local/${index}`;
      const res = await fetch(`http://localhost:8000${endpoint}`);
      const data = await res.json();
      if (res.ok) setLocalExplanation(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRowClick = (index) => {
    setActiveRow(index);
    fetchLocal(index, explainMethod);
  };

  const handleMethodToggle = (method) => {
    setExplainMethod(method);
    if (activeRow !== null) {
      fetchLocal(activeRow, method);
    }
  };

  const isDark = theme === 'dark';
  const colors = {
      paperBg: 'rgba(0,0,0,0)', plotBg: 'rgba(0,0,0,0)',
      textColor: isDark ? '#e5e7eb' : '#1f2937',
      gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  };

  const globalData = [{
      type: 'bar',
      x: globalImportances.map(x => x.importance),
      y: globalImportances.map(x => x.feature),
      orientation: 'h',
      marker: { color: globalImportances.map(x => x.importance), colorscale: 'Viridis' }
  }];

  const globalLayout = {
      margin: { t: 20, b: 40, l: 120, r: 20 },
      paper_bgcolor: colors.paperBg, plot_bgcolor: colors.plotBg,
      font: { color: colors.textColor, family: 'Inter, sans-serif' },
      xaxis: { title: 'Relative Importance Score', gridcolor: colors.gridColor, linecolor: colors.gridColor },
      yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor }
  };

  let localData = [];
  if (localExplanation) {
    const contributions = [...localExplanation.contributions].reverse();
    const features = contributions.map(c => `${c.feature} = ${c.value}`);
    const values = contributions.map(c => c.contribution);
    const barColors = values.map(v => v >= 0 ? 'rgba(20, 184, 166, 0.85)' : 'rgba(239, 68, 68, 0.85)');
    localData = [{
        type: 'bar', x: values, y: features, orientation: 'h', marker: { color: barColors }
    }];
  }

  const localLayout = {
      margin: { t: 10, b: 40, l: 150, r: 20 },
      paper_bgcolor: colors.paperBg, plot_bgcolor: colors.plotBg,
      font: { color: colors.textColor, family: 'Inter, sans-serif', size: 11 },
      xaxis: { title: explainMethod === 'shap' ? 'SHAP Value (Impact on Output)' : 'Contribution Weight (LIME Coefficients)', gridcolor: colors.gridColor, linecolor: colors.gridColor },
      yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor }
  };

  if (!metrics) return <div>Train model to view explainability charts.</div>;

  return (
    <>
      <div className="card mb-4">
          <div className="card-header"><h3>Global Interpretability</h3></div>
          <div className="card-body">
              <p className="tab-description">This chart shows the global contribution of each feature to the model's overall decisions based on permutation feature importances.</p>
              {globalImportances.length > 0 && <Plot data={globalData} layout={globalLayout} config={{displayModeBar: false}} useResizeHandler={true} style={{width: '100%', height: '350px'}} />}
          </div>
      </div>

      <div className="row">
          <div className="col-md-6 card">
              <div className="card-header"><h3>Local Instances Selector</h3></div>
              <div className="card-body scroll-card">
                  <p className="tab-description">Select a test set instance below to examine its local decision boundaries.</p>
                  <div className="table-container">
                      <table className="instances-table">
                          <thead>
                              <tr><th>Index</th><th>Actual Y</th><th>Pred Y</th></tr>
                          </thead>
                          <tbody>
                              {samples.map(s => (
                                <tr key={s.__index} className={activeRow === s.__index ? 'selected' : ''} onClick={() => handleRowClick(s.__index)}>
                                  <td>{s.__index}</td>
                                  <td><span className={`badge-y ${s.__y_true === 1 ? 'positive' : 'negative'}`}>{s.__y_true}</span></td>
                                  <td><span className={`badge-y ${s.__y_pred === 1 ? 'positive' : 'negative'}`}>{s.__y_pred}</span></td>
                                </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>

          <div className="col-md-6 card">
              <div className="card-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <h3 style={{margin: 0}}>Local Explanation</h3>
                  <div className="radio-toggle-group" style={{margin: 0}}>
                      <label className="radio-toggle" style={{padding: '4px 8px', fontSize: '12px'}}>
                          <input type="radio" checked={explainMethod === 'lime'} onChange={() => handleMethodToggle('lime')} />
                          <span>LIME</span>
                      </label>
                      <label className="radio-toggle" style={{padding: '4px 8px', fontSize: '12px'}}>
                          <input type="radio" checked={explainMethod === 'shap'} onChange={() => handleMethodToggle('shap')} />
                          <span>SHAP</span>
                      </label>
                  </div>
              </div>
              <div className="card-body explanation-placeholder">
                  {!localLoading && !localExplanation && (
                    <div className="centered-placeholder">
                        <i className="fa-solid fa-arrow-left pulse-icon"></i>
                        <p>Click on any data row in the selector table to inspect feature contributions.</p>
                    </div>
                  )}
                  {localLoading && <div className="centered-placeholder"><div className="spinner" style={{width:32, height:32}}></div><p>Fitting local LIME model...</p></div>}
                  {localExplanation && (
                    <div style={{width: '100%'}}>
                      <div className="local-meta-info" style={{marginBottom: 16, fontSize: 13}}>
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom: 6}}>
                              <span>Instance: <strong>#{localExplanation.row_index}</strong></span>
                              <span>Class: <strong className={`badge-y ${localExplanation.prediction_class === 1 ? 'positive' : 'negative'}`}>{localExplanation.prediction_class}</strong></span>
                          </div>
                          <div>Model Probability: <strong>{(localExplanation.prediction_probability * 100).toFixed(1)}%</strong></div>
                      </div>
                      <Plot data={localData} layout={localLayout} config={{displayModeBar: false}} useResizeHandler={true} style={{width: '100%', height: '320px'}} />
                    </div>
                  )}
              </div>
          </div>
      </div>
    </>
  );
}

export default ExplainTab;
