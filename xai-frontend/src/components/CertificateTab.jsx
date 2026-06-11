import React from 'react';

function CertificateTab({ metrics, trainingStats, target, sensitive }) {
  if (!metrics) {
    return <div>Train model to generate certificate.</div>;
  }

  const handlePrint = () => {
    window.print();
  };

  const lvl = metrics.certification_level;
  let sealClass = '';
  if (lvl === 'GOLD') sealClass = 'seal-gold';
  else if (lvl === 'SILVER') sealClass = 'seal-silver';
  else if (lvl === 'BRONZE') sealClass = 'seal-bronze';
  else sealClass = 'seal-fail';

  return (
    <div className="card flex-center">
        <div className="certificate-controls">
            <button className="btn btn-secondary" onClick={handlePrint}>
                <i className="fa-solid fa-print"></i> Print Certificate
            </button>
        </div>
        
        <div className="certificate-border" id="certificateFrame">
            <div className={`certificate-container ${sealClass}`}>
                <div className="cert-header">
                    <i className="fa-solid fa-circle-nodes cert-logo"></i>
                    <h2>Responsible AI Compliance Certificate</h2>
                    <p>Issued by the Explainable AI Certification Engine</p>
                </div>
                
                <div className="cert-body">
                    <p className="cert-intro">This document certifies that the evaluated Machine Learning Model has undergone ethical audits, including bias assessment and explanation validation.</p>
                    
                    <div className="cert-rating-box">
                        <span className="cert-label">COMPLIANCE RATING</span>
                        <div className="cert-rating-val">{lvl}</div>
                    </div>

                    <div className="cert-details">
                        <div className="cert-detail-row">
                            <span className="d-label">Model Architecture:</span>
                            <span className="d-val">{trainingStats ? (trainingStats.source === 'uploaded' ? 'Pre-trained Upload' : trainingStats.model_type) : '--'}</span>
                        </div>
                        <div className="cert-detail-row">
                            <span className="d-label">Target Field (Y):</span>
                            <span className="d-val">{target || '--'}</span>
                        </div>
                        <div className="cert-detail-row">
                            <span className="d-label">Sensitive Attribute (A):</span>
                            <span className="d-val">{sensitive || '--'}</span>
                        </div>
                        <div className="cert-detail-row">
                            <span className="d-label">Accuracy Score:</span>
                            <span className="d-val">{trainingStats ? (trainingStats.accuracy * 100).toFixed(2) + '%' : '--'}</span>
                        </div>
                        <div className="cert-detail-row">
                            <span className="d-label">Compliance Score:</span>
                            <span className="d-val">{metrics.compliance_score.toFixed(1)} / 100</span>
                        </div>
                    </div>
                </div>
                
                <div className="cert-footer">
                    <div className={`cert-seal ${sealClass}`}>
                        <i className={`fa-solid ${lvl !== 'FAIL' ? 'fa-award' : 'fa-circle-xmark'} seal-icon`}></i>
                        <span>{lvl !== 'FAIL' ? 'VERIFIED ETHICAL AI' : 'AUDIT FAILED'}</span>
                    </div>
                    <div className="cert-signatures">
                        <div className="signature">
                            <div className="sig-line"></div>
                            <span>Auditing Engine</span>
                        </div>
                        <div className="signature">
                            <div className="sig-line"></div>
                            <span>Compliance Officer</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}

export default CertificateTab;
