import React, { useState, useEffect, useRef } from 'react';

function SetupPanel({ onTrain, setIsLoading, setLoadingMessage }) {
  const [dataSource, setDataSource] = useState('benchmark');
  const [builtInSelect, setBuiltInSelect] = useState('benchmark');
  
  const [datasetInfo, setDatasetInfo] = useState({
    filePath: null,
    columns: [],
    target: '',
    sensitive: ''
  });

  const [modelSource, setModelSource] = useState('train');
  const [modelType, setModelType] = useState('random_forest');
  const [builtinModel, setBuiltinModel] = useState('adult_rf_model.pkl');
  const [modelFile, setModelFile] = useState(null);
  const [csvFile, setCsvFile] = useState(null);

  const csvInputRef = useRef(null);
  const modelInputRef = useRef(null);

  useEffect(() => {
    if (dataSource === 'benchmark') {
      loadBuiltInDataset(builtInSelect);
    } else {
      setDatasetInfo({ filePath: null, columns: [], target: '', sensitive: '' });
    }
  }, [dataSource, builtInSelect]);

  const loadBuiltInDataset = async (name) => {
    setIsLoading(true);
    setLoadingMessage(`Loading dataset '${name}'...`);
    try {
      const endpoint = name === 'benchmark' ? '/api/dataset/load-benchmark' : `/api/dataset/load-built-in/${name}`;
      const res = await fetch(`http://localhost:8000${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDatasetInfo({
          filePath: null,
          columns: data.columns,
          target: data.target_column,
          sensitive: data.sensitive_column
        });
      } else {
        alert(data.detail);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setIsLoading(true);
    setLoadingMessage("Uploading dataset...");
    
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch('http://localhost:8000/api/dataset/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setDatasetInfo({
          filePath: data.file_path,
          columns: data.columns,
          target: data.columns[data.columns.length - 1],
          sensitive: data.columns.find(c => ['gender', 'race', 'age', 'sex'].includes(c.toLowerCase())) || data.columns[0]
        });
      } else {
        alert(data.detail);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setModelFile(file);
    setIsLoading(true);
    setLoadingMessage("Uploading model...");
    
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch('http://localhost:8000/api/model/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail);
        setModelFile(null);
      }
    } catch (e) {
      console.error(e);
      setModelFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = () => {
    if (dataSource === 'custom' && !datasetInfo.filePath) {
      alert("Please upload a CSV dataset first.");
      return;
    }
    const formData = new FormData();
    if (dataSource === 'custom') formData.append("file_path", datasetInfo.filePath);
    formData.append("target_col", datasetInfo.target);
    formData.append("sensitive_col", datasetInfo.sensitive);

    if (modelSource === 'upload') {
      if (!modelFile) {
        alert("Please upload a pre-trained model file first.");
        return;
      }
      formData.append("use_uploaded_model", "true");
      formData.append("model_type", "uploaded");
    } else if (modelSource === 'builtin') {
      formData.append("builtin_model", builtinModel);
      formData.append("use_uploaded_model", "false");
      formData.append("model_type", "builtin");
    } else {
      formData.append("use_uploaded_model", "false");
      formData.append("model_type", modelType);
    }

    onTrain(formData, modelSource === 'upload');
  };

  return (
    <section className="control-panel card">
      <div className="card-header">
          <h3><i className="fa-solid fa-sliders"></i> Audit Setup</h3>
      </div>
      <div className="card-body">
          <div className="control-group">
              <label className="control-label">Data Source</label>
              <div className="radio-toggle-group">
                  <label className="radio-toggle">
                      <input type="radio" checked={dataSource === 'benchmark'} onChange={() => setDataSource('benchmark')} />
                      <span>Built-in Datasets</span>
                  </label>
                  <label className="radio-toggle">
                      <input type="radio" checked={dataSource === 'custom'} onChange={() => setDataSource('custom')} />
                      <span>Custom Upload</span>
                  </label>
              </div>
          </div>

          {dataSource === 'benchmark' && (
            <div className="control-group">
                <label className="control-label">Select Dataset</label>
                <select className="form-select" value={builtInSelect} onChange={e => setBuiltInSelect(e.target.value)}>
                    <option value="benchmark">Adult Census Income (Bronze Bias)</option>
                    <option value="german_credit">German Credit Risk (Bronze/Pass Bias)</option>
                    <option value="college_admissions">College Admissions (High Bias - Fail)</option>
                    <option value="employee_promotion">Employee Promotion (Low Bias - Gold/Silver)</option>
                    <option value="recidivism_risk">Recidivism Risk (High Bias - Fail)</option>
                </select>
            </div>
          )}

          {dataSource === 'custom' && (
            <div className="control-group">
                <label className="control-label">Upload CSV Dataset</label>
                <div className="upload-zone" onClick={() => csvInputRef.current.click()}>
                    <i className="fa-solid fa-cloud-arrow-up upload-icon"></i>
                    <p>Drag & drop or click to upload</p>
                    <span className="file-info">{csvFile ? csvFile.name : 'No file selected'}</span>
                    <input type="file" ref={csvInputRef} accept=".csv" className="hidden-input" onChange={handleCsvUpload} style={{display:'none'}} />
                </div>
            </div>
          )}

          <div className="control-group">
              <label className="control-label">Target Feature (Y)</label>
              <select className="form-select" value={datasetInfo.target} onChange={e => setDatasetInfo({...datasetInfo, target: e.target.value})}>
                  {datasetInfo.columns.length === 0 && <option value="">-- Upload dataset first --</option>}
                  {datasetInfo.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
          </div>

          <div className="control-group">
              <label className="control-label">Sensitive Attribute (A)</label>
              <select className="form-select" value={datasetInfo.sensitive} onChange={e => setDatasetInfo({...datasetInfo, sensitive: e.target.value})}>
                  {datasetInfo.columns.length === 0 && <option value="">-- Upload dataset first --</option>}
                  {datasetInfo.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
          </div>

          <div className="control-group mt-3">
              <label className="control-label">Model Source</label>
              <div className="radio-toggle-group">
                  <label className="radio-toggle">
                      <input type="radio" checked={modelSource === 'train'} onChange={() => setModelSource('train')} />
                      <span>Train New</span>
                  </label>
                  <label className="radio-toggle">
                      <input type="radio" checked={modelSource === 'upload'} onChange={() => setModelSource('upload')} />
                      <span>Upload</span>
                  </label>
                  <label className="radio-toggle">
                      <input type="radio" checked={modelSource === 'builtin'} onChange={() => setModelSource('builtin')} />
                      <span>Built-in</span>
                  </label>
              </div>
          </div>

          {modelSource === 'train' && (
            <div className="control-group">
                <label className="control-label">Classifier Architecture</label>
                <select className="form-select" value={modelType} onChange={e => setModelType(e.target.value)}>
                    <option value="random_forest">Random Forest Classifier</option>
                    <option value="logistic_regression">Logistic Regression</option>
                </select>
            </div>
          )}
          
          {modelSource === 'upload' && (
            <div className="control-group">
                <label className="control-label">Upload Pre-trained Model (.pkl, .joblib, .h5, .pt, .onnx)</label>
                <div className="upload-zone" onClick={() => modelInputRef.current.click()}>
                    <i className="fa-solid fa-microchip upload-icon"></i>
                    <p>Drag & drop or click to upload</p>
                    <span className="file-info">{modelFile ? modelFile.name : 'No file selected'}</span>
                    <input type="file" ref={modelInputRef} accept=".pkl,.joblib,.h5,.pt,.pth,.onnx" className="hidden-input" onChange={handleModelUpload} style={{display:'none'}} />
                </div>
            </div>
          )}

          {modelSource === 'builtin' && (
            <div className="control-group">
                <label className="control-label">Select Built-in Model</label>
                <select className="form-select" value={builtinModel} onChange={e => setBuiltinModel(e.target.value)}>
                    <option value="adult_rf_model.pkl">Adult Census Income - Random Forest</option>
                    <option value="german_lr_model.pkl">German Credit - Logistic Regression</option>
                </select>
            </div>
          )}

          <button className="btn btn-primary btn-block" onClick={handleActionClick}>
              <i className="fa-solid fa-wand-magic-sparkles"></i> {modelSource === 'upload' ? 'Apply Model & Run Audit' : 'Train & Run Audit'}
          </button>
      </div>
    </section>
  );
}

export default SetupPanel;
