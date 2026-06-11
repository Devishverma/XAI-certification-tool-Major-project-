import React from 'react';

function MitigationsTab({ metrics }) {
  if (!metrics) {
    return (
      <div className="card">
          <div className="card-header"><h3>Actionable Mitigations</h3></div>
          <div className="card-body">
              <p className="tab-description">Based on the calculated metrics, our responsible AI engine recommends improvements.</p>
              <div className="recommendations-list">
                  <div className="empty-state">
                      <i className="fa-solid fa-clipboard-question"></i>
                      <p>Train the model and run the audit to receive recommendation sheets.</p>
                  </div>
              </div>
          </div>
      </div>
    );
  }

  const recommendations = [];
  const compliance = metrics.compliance_score;
  const groups = Object.keys(metrics.group_stats);
  const minSelectionGroup = groups.reduce((a, b) => metrics.group_stats[a].selection_rate < metrics.group_stats[b].selection_rate ? a : b);
  const maxSelectionGroup = groups.reduce((a, b) => metrics.group_stats[a].selection_rate > metrics.group_stats[b].selection_rate ? a : b);

  if (compliance >= 90) {
      recommendations.push({
          type: 'success',
          icon: 'fa-circle-check',
          title: 'Model Meets High Ethical Standards',
          desc: 'Your model exhibits strong fairness across groups. Continue monitoring model drift in production.'
      });
  }
  if (metrics.disparate_impact_ratio < 0.8) {
      recommendations.push({
          type: 'danger',
          icon: 'fa-triangle-exclamation',
          title: 'Severe Disparate Impact Detected',
          desc: `The disparate impact ratio is ${(metrics.disparate_impact_ratio).toFixed(2)} (Target >= 0.8). Group '${minSelectionGroup}' is selected at a much lower rate than '${maxSelectionGroup}'. Consider upsampling '${minSelectionGroup}' in your training data or using class weights.`
      });
  }
  if (metrics.equal_opportunity_difference > 0.1) {
      recommendations.push({
          type: 'warning',
          icon: 'fa-scale-unbalanced',
          title: 'Unequal Opportunity (TPR Disparity)',
          desc: `There is a ${(metrics.equal_opportunity_difference * 100).toFixed(1)}% difference in True Positive Rates between groups. The model is better at correctly identifying positive outcomes for one group over another. Post-processing threshold adjustment is recommended.`
      });
  }

  return (
    <div className="card">
        <div className="card-header"><h3>Actionable Mitigations</h3></div>
        <div className="card-body">
            <p className="tab-description">Based on the calculated metrics, our responsible AI engine recommends the following improvements to reduce bias and enhance interpretability.</p>
            <div className="recommendations-list">
                {recommendations.map((rec, i) => (
                  <div key={i} className={`recommendation-item ${rec.type}`}>
                      <i className={`fa-solid ${rec.icon}`}></i>
                      <div className="rec-text">
                          <h4>{rec.title}</h4>
                          <p>{rec.desc}</p>
                      </div>
                  </div>
                ))}
            </div>
        </div>
    </div>
  );
}

export default MitigationsTab;
