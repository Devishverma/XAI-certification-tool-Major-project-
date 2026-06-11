import React from 'react';
import PlotComponent from 'react-plotly.js';
const Plot = PlotComponent.default || PlotComponent;

function AuditTab({ metrics, theme }) {
  if (!metrics) {
    return (
      <div className="row">
        <div className="col-md-5 card gauge-card">
            <div className="card-header"><h3>Ethical Compliance Level</h3></div>
            <div className="card-body centered">
                <div className="compliance-badge-large">PENDING</div>
            </div>
        </div>
        <div className="col-md-7 card">
            <div className="card-header"><h3>Fairness Audit Scorecard</h3></div>
            <div className="card-body">
                <table className="scorecard-table">
                    <thead><tr><th>Metric</th><th>Value</th><th>Threshold</th><th>Status</th></tr></thead>
                    <tbody><tr><td colSpan="4" className="text-center">Train model to generate metrics.</td></tr></tbody>
                </table>
            </div>
        </div>
      </div>
    );
  }

  const isDark = theme === 'dark';
  const colors = {
      paperBg: 'rgba(0,0,0,0)',
      plotBg: 'rgba(0,0,0,0)',
      textColor: isDark ? '#e5e7eb' : '#1f2937',
      gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      colorScale: isDark ? ['#14b8a6', '#8b5cf6'] : ['#0d9488', '#7c3aed']
  };

  const lvl = metrics.certification_level;
  let badgeClass = '';
  if (lvl === 'GOLD') badgeClass = 'gold';
  else if (lvl === 'SILVER') badgeClass = 'silver';
  else if (lvl === 'BRONZE') badgeClass = 'bronze';
  else badgeClass = 'fail';

  const gaugeData = [{
      domain: { x: [0, 1], y: [0, 1] },
      value: metrics.compliance_score,
      title: { text: "Audit Score", font: { size: 16 } },
      type: "indicator",
      mode: "gauge+number",
      gauge: {
          axis: { range: [0, 100], tickcolor: colors.textColor },
          bar: { color: colors.colorScale[0] },
          bgcolor: 'rgba(255,255,255,0.05)',
          borderwidth: 1,
          bordercolor: colors.textColor,
          steps: [
              { range: [0, 60], color: 'rgba(239, 68, 68, 0.15)' },
              { range: [60, 75], color: 'rgba(180, 83, 9, 0.15)' },
              { range: [75, 90], color: 'rgba(156, 163, 175, 0.15)' },
              { range: [90, 100], color: 'rgba(16, 185, 129, 0.15)' }
          ]
      }
  }];
  
  const gaugeLayout = {
      width: 260,
      height: 200,
      margin: { t: 40, b: 0, l: 20, r: 20 },
      paper_bgcolor: colors.paperBg,
      font: { color: colors.textColor, family: 'Inter, sans-serif' }
  };

  const scoreRows = [
      { name: 'Disparate Impact Ratio', val: metrics.disparate_impact_ratio, thresh: '>= 0.80', pass: metrics.disparate_impact_ratio >= 0.80 },
      { name: 'Demographic Parity Diff', val: metrics.demographic_parity_difference, thresh: '<= 0.10', pass: metrics.demographic_parity_difference <= 0.10 },
      { name: 'Equal Opportunity Diff (TPR)', val: metrics.equal_opportunity_difference, thresh: '<= 0.10', pass: metrics.equal_opportunity_difference <= 0.10 },
      { name: 'Equalized Odds Difference', val: metrics.equalized_odds_difference, thresh: '<= 0.15', pass: metrics.equalized_odds_difference <= 0.15 }
  ];

  const groups = Object.keys(metrics.group_stats);
  const selectionRates = groups.map(g => metrics.group_stats[g].selection_rate);
  const tprs = groups.map(g => metrics.group_stats[g].tpr);

  const selChartData = [{
      x: groups, y: selectionRates, type: 'bar',
      marker: { color: colors.colorScale[0] },
      text: selectionRates.map(v => `${(v * 100).toFixed(1)}%`), textposition: 'auto'
  }];
  
  const tprChartData = [{
      x: groups, y: tprs, type: 'bar',
      marker: { color: colors.colorScale[1] },
      text: tprs.map(v => `${(v * 100).toFixed(1)}%`), textposition: 'auto'
  }];

  const barLayout = {
      margin: { t: 20, b: 40, l: 40, r: 20 },
      paper_bgcolor: colors.paperBg,
      plot_bgcolor: colors.plotBg,
      font: { color: colors.textColor, family: 'Inter, sans-serif' },
      xaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor },
      yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor, tickformat: ',.0%' }
  };

  return (
    <>
      <div className="row">
          <div className="col-md-5 card gauge-card">
              <div className="card-header">
                  <h3>Ethical Compliance Level</h3>
              </div>
              <div className="card-body centered">
                  <Plot data={gaugeData} layout={gaugeLayout} config={{displayModeBar: false}} />
                  <div className={`compliance-badge-large ${badgeClass}`}>{lvl}</div>
              </div>
          </div>
          
          <div className="col-md-7 card">
              <div className="card-header">
                  <h3>Fairness Audit Scorecard</h3>
              </div>
              <div className="card-body">
                  <table className="scorecard-table">
                      <thead>
                          <tr><th>Metric</th><th>Value</th><th>Threshold</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                          {scoreRows.map((row, i) => (
                            <tr key={i}>
                              <td>{row.name}</td>
                              <td style={{fontWeight: '600'}}>{row.val.toFixed(3)}</td>
                              <td>{row.thresh}</td>
                              <td><span className={`badge-status ${row.pass ? 'pass' : 'fail'}`}>{row.pass ? 'PASS' : 'FAIL'}</span></td>
                            </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>

      <div className="row mt-4">
          <div className="col-md-6 card">
              <div className="card-header"><h3>Selection Rate by Group</h3></div>
              <div className="card-body">
                  <Plot data={selChartData} layout={barLayout} config={{displayModeBar: false}} useResizeHandler={true} style={{width: '100%', height: '100%'}} />
              </div>
          </div>
          <div className="col-md-6 card">
              <div className="card-header"><h3>True Positive Rate (Equal Opportunity)</h3></div>
              <div className="card-body">
                  <Plot data={tprChartData} layout={barLayout} config={{displayModeBar: false}} useResizeHandler={true} style={{width: '100%', height: '100%'}} />
              </div>
          </div>
      </div>
    </>
  );
}

export default AuditTab;
