// State Management
let currentDatasetInfo = {
    source: 'benchmark', // 'benchmark' or 'custom'
    filePath: null,
    columns: [],
    numericalColumns: [],
    categoricalColumns: []
};

let activeRowIndex = null;
let auditMetrics = null;
let currentModelInfo = {
    source: 'train', // 'train' or 'upload'
    filePath: null,
    modelName: null
};

// DOM Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const dataSourceRadios = document.querySelectorAll('input[name="dataSource"]');
const uploadGroup = document.getElementById('uploadGroup');
const dropZone = document.getElementById('dropZone');
const csvFileInput = document.getElementById('csvFileInput');
const fileInfo = document.getElementById('fileInfo');
const targetSelect = document.getElementById('targetSelect');
const sensitiveSelect = document.getElementById('sensitiveSelect');
const modelTypeSelect = document.getElementById('modelTypeSelect');
const btnTrainAudit = document.getElementById('btnTrainAudit');
const loaderOverlay = document.getElementById('loaderOverlay');
const loaderMessage = document.getElementById('loaderMessage');
const builtInSelect = document.getElementById('builtInSelect');
const builtInGroup = document.getElementById('builtInGroup');

// Model DOM Elements
const modelSourceRadios = document.querySelectorAll('input[name="modelSource"]');
const modelTrainGroup = document.getElementById('modelTrainGroup');
const modelUploadGroup = document.getElementById('modelUploadGroup');
const modelDropZone = document.getElementById('modelDropZone');
const modelFileInput = document.getElementById('modelFileInput');
const modelFileInfo = document.getElementById('modelFileInfo');

// Badge Elements
const badgeModelType = document.getElementById('badgeModelType');
const badgeAccuracy = document.getElementById('badgeAccuracy');
const badgeCertLevel = document.getElementById('badgeCertLevel');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupNavigation();
    setupDataSourceToggle();
    setupFileUpload();
    setupModelSourceToggle();
    setupModelUpload();
    
    // Load default benchmark state on start
    loadBenchmarkDataset(false); // don't show loading message, just load definitions
    
    btnTrainAudit.addEventListener('click', handleTrainAndAudit);
    
    // Hook Export JSON button
    document.getElementById('btnExportJSON').addEventListener('click', exportJSONReport);
});

// Theme Toggle Handler
function setupThemeToggle() {
    themeToggleBtn.addEventListener('click', () => {
        const body = document.body;
        const icon = themeToggleBtn.querySelector('i');
        const text = themeToggleBtn.querySelector('span');
        
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            icon.className = 'fa-solid fa-sun';
            text.textContent = 'Light Theme';
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            icon.className = 'fa-solid fa-moon';
            text.textContent = 'Dark Theme';
        }
        
        // Re-render active charts to update colors
        if (auditMetrics) {
            renderAuditDashboard();
        }
        renderGlobalImportance();
        if (activeRowIndex !== null) {
            loadLocalExplanation(activeRowIndex);
        }
    });
}

// Navigation Tabs Handler
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Re-draw plotly charts to fix resizing inside hidden containers
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        });
    });
}

// Data Source Radio Buttons Toggle Handler
function setupDataSourceToggle() {
    dataSourceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const value = e.target.value;
            currentDatasetInfo.source = value;
            
            if (value === 'custom') {
                uploadGroup.classList.remove('hidden');
                builtInGroup.classList.add('hidden');
                clearMappingSelects();
            } else {
                uploadGroup.classList.add('hidden');
                builtInGroup.classList.remove('hidden');
                loadSelectedBuiltInDataset(builtInSelect.value);
            }
        });
    });
    
    // Built-in select change event
    builtInSelect.addEventListener('change', (e) => {
        loadSelectedBuiltInDataset(e.target.value);
    });
}

function setupModelSourceToggle() {
    modelSourceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const value = e.target.value;
            currentModelInfo.source = value;
            
            if (value === 'upload') {
                modelUploadGroup.classList.remove('hidden');
                modelTrainGroup.classList.add('hidden');
                btnTrainAudit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Apply Model & Run Audit';
            } else {
                modelUploadGroup.classList.add('hidden');
                modelTrainGroup.classList.remove('hidden');
                btnTrainAudit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Train & Run Audit';
            }
        });
    });
}

// Loads the chosen built-in dataset
async function loadSelectedBuiltInDataset(datasetName) {
    if (datasetName === 'benchmark') {
        await loadBenchmarkDataset(true);
        return;
    }
    
    showLoader(`Loading built-in dataset '${datasetName}'...`);
    try {
        const response = await fetch(`/api/dataset/load-built-in/${datasetName}`, { method: 'POST' });
        const data = await response.json();
        hideLoader();
        
        if (response.ok) {
            currentDatasetInfo.source = 'benchmark';
            currentDatasetInfo.filePath = null;
            currentDatasetInfo.columns = data.columns;
            currentDatasetInfo.numericalColumns = data.numerical_columns;
            currentDatasetInfo.categoricalColumns = data.categorical_columns;
            
            // Populate select options
            populateMappingSelects(data.columns);
            
            // Set values to default mapped target/sensitive columns
            targetSelect.value = data.target_column;
            sensitiveSelect.value = data.sensitive_column;
        } else {
            alert(data.detail || "Error loading dataset.");
        }
    } catch (err) {
        hideLoader();
        console.error(err);
        alert("Failed to connect to backend dataset loader.");
    }
}

// File Drag and Drop Handler
function setupFileUpload() {
    // Click triggers hidden input click
    dropZone.addEventListener('click', () => csvFileInput.click());
    
    // Drag/drop effects
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent-secondary)';
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'var(--border-color)';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });
    
    csvFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });
}

function setupModelUpload() {
    modelDropZone.addEventListener('click', () => modelFileInput.click());
    
    modelDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        modelDropZone.style.borderColor = 'var(--accent-secondary)';
    });
    
    modelDropZone.addEventListener('dragleave', () => {
        modelDropZone.style.borderColor = 'var(--border-color)';
    });
    
    modelDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        modelDropZone.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) {
            handleModelSelection(e.dataTransfer.files[0]);
        }
    });
    
    modelFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleModelSelection(e.target.files[0]);
        }
    });
}

function handleModelSelection(file) {
    if (!file.name.endsWith('.pkl') && !file.name.endsWith('.joblib')) {
        alert('Please upload a valid .pkl or .joblib model file.');
        return;
    }
    modelFileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    uploadModelFile(file);
}

async function uploadModelFile(file) {
    showLoader("Uploading model...");
    const formData = new FormData();
    formData.append("file", file);
    
    try {
        const response = await fetch('/api/model/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        hideLoader();
        
        if (response.ok) {
            currentModelInfo.filePath = data.file_path;
            currentModelInfo.modelName = file.name;
        } else {
            alert(data.detail || "Failed to upload model.");
        }
    } catch (err) {
        hideLoader();
        console.error(err);
        alert("Error uploading model.");
    }
}

function handleFileSelection(file) {
    if (!file.name.endsWith('.csv')) {
        alert('Please upload a valid CSV file.');
        return;
    }
    fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    uploadFile(file);
}

// Upload file to server
async function uploadFile(file) {
    showLoader("Uploading dataset...");
    const formData = new FormData();
    formData.append("file", file);
    
    try {
        const response = await fetch('/api/dataset/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        hideLoader();
        
        if (response.ok) {
            currentDatasetInfo.filePath = data.file_path;
            currentDatasetInfo.columns = data.columns;
            currentDatasetInfo.numericalColumns = data.numerical_columns;
            currentDatasetInfo.categoricalColumns = data.categorical_columns;
            
            populateMappingSelects(data.columns);
        } else {
            alert(data.detail || "Failed to upload file.");
        }
    } catch (err) {
        hideLoader();
        console.error(err);
        alert("Error uploading dataset.");
    }
}

// Populate Target and Sensitive dropdown options
function populateMappingSelects(columns) {
    targetSelect.innerHTML = '';
    sensitiveSelect.innerHTML = '';
    
    columns.forEach(col => {
        const optTarget = document.createElement('option');
        optTarget.value = col;
        optTarget.textContent = col;
        targetSelect.appendChild(optTarget);
        
        const optSensitive = document.createElement('option');
        optSensitive.value = col;
        optSensitive.textContent = col;
        sensitiveSelect.appendChild(optSensitive);
    });
    
    // Choose sensible default columns if present
    // Target defaults to last column
    if (columns.length > 0) {
        targetSelect.value = columns[columns.length - 1];
    }
    // Sensitive defaults to Gender/Race if present, else first column
    const defaultSensitive = columns.find(c => ['gender', 'race', 'age', 'sex'].includes(c.toLowerCase()));
    if (defaultSensitive) {
        sensitiveSelect.value = defaultSensitive;
    } else {
        sensitiveSelect.value = columns[0];
    }
}

function clearMappingSelects() {
    targetSelect.innerHTML = '<option value="">-- Upload dataset first --</option>';
    sensitiveSelect.innerHTML = '<option value="">-- Upload dataset first --</option>';
}

// Load Benchmark Census Dataset
async function loadBenchmarkDataset(showLoading = true) {
    if (showLoading) showLoader("Loading census benchmark dataset...");
    
    try {
        const response = await fetch('/api/dataset/load-benchmark', { method: 'POST' });
        const data = await response.json();
        if (showLoading) hideLoader();
        
        if (response.ok) {
            currentDatasetInfo.source = 'benchmark';
            currentDatasetInfo.filePath = null;
            currentDatasetInfo.columns = data.columns;
            currentDatasetInfo.numericalColumns = data.numerical_columns;
            currentDatasetInfo.categoricalColumns = data.categorical_columns;
            
            // Populate selects
            targetSelect.innerHTML = `<option value="${data.target_column}">${data.target_column}</option>`;
            sensitiveSelect.innerHTML = `<option value="${data.sensitive_column}">${data.sensitive_column}</option>`;
            
            // Add race and other attributes if users want to change it
            data.columns.forEach(col => {
                if (col !== data.target_column) {
                    if (col !== data.sensitive_column) {
                        const opt = document.createElement('option');
                        opt.value = col;
                        opt.textContent = col;
                        sensitiveSelect.appendChild(opt);
                    }
                }
            });
            
            targetSelect.value = data.target_column;
            sensitiveSelect.value = data.sensitive_column;
        } else {
            if (showLoading) alert("Error loading benchmark dataset.");
        }
    } catch (err) {
        if (showLoading) hideLoader();
        console.error(err);
    }
}

// Loader Utilities
function showLoader(message = "Auditing ML Model...") {
    loaderMessage.textContent = message;
    loaderOverlay.classList.remove('hidden');
}

function hideLoader() {
    loaderOverlay.classList.add('hidden');
}

// Get Theme Colors for Plotly Charts
function getThemeChartColors() {
    const isDark = document.body.classList.contains('dark-theme');
    return {
        paperBg: 'rgba(0,0,0,0)',
        plotBg: 'rgba(0,0,0,0)',
        textColor: isDark ? '#e5e7eb' : '#1f2937',
        gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        colorScale: isDark ? ['#14b8a6', '#8b5cf6'] : ['#0d9488', '#7c3aed']
    };
}

// Trigger Model Training & Run Audit Flow
async function handleTrainAndAudit() {
    if (currentDatasetInfo.source === 'custom' && !currentDatasetInfo.filePath) {
        alert("Please upload a CSV dataset first.");
        return;
    }
    
    showLoader(currentModelInfo.source === 'upload' ? "Applying model and running audits..." : "Training classifier and running audits...");
    
    const formData = new FormData();
    if (currentDatasetInfo.source === 'custom') {
        formData.append("file_path", currentDatasetInfo.filePath);
    }
    
    formData.append("target_col", targetSelect.value);
    formData.append("sensitive_col", sensitiveSelect.value);
    
    if (currentModelInfo.source === 'upload') {
        if (!currentModelInfo.filePath) {
            hideLoader();
            alert("Please upload a pre-trained model file first.");
            return;
        }
        formData.append("use_uploaded_model", "true");
        formData.append("model_type", "uploaded"); // Backend won't use it to train, but requires the form field if it's there or we provide a default in FastAPI
    } else {
        formData.append("use_uploaded_model", "false");
        formData.append("model_type", modelTypeSelect.value);
    }
    
    try {
        const trainResponse = await fetch('/api/model/train', {
            method: 'POST',
            body: formData
        });
        const trainData = await trainResponse.json();
        
        if (!trainResponse.ok) {
            hideLoader();
            alert(trainData.detail || "Training failed.");
            return;
        }
        
        // Train succeeded, run audits, feature importances, and sample list
        await updateDashboardMeta(trainData.training);
        await runAuditing();
        await runGlobalExplain();
        await loadTestSamples();
        
        hideLoader();
        
        // Auto-switch to audit tab if not there
        const auditTabNav = document.querySelector('[data-tab="audit-tab"]');
        if (auditTabNav) auditTabNav.click();
        
    } catch (err) {
        hideLoader();
        console.error(err);
        alert("Failed to complete audit calculations.");
    }
}

// Update Top Navbar Meta Info
function updateDashboardMeta(training) {
    let modelLabel = training.model_type;
    if (training.model_type === 'random_forest') modelLabel = 'Random Forest';
    if (training.model_type === 'logistic_regression') modelLabel = 'Logistic Regression';
    if (training.source === 'uploaded') modelLabel = `${modelLabel} (Uploaded)`;
    
    badgeModelType.querySelector('span').textContent = `Model: ${modelLabel}`;
    badgeAccuracy.querySelector('span').textContent = `Accuracy: ${(training.accuracy * 100).toFixed(1)}%`;
}

// Run Auditing (Bias dashboard, metrics, rating)
async function runAuditing() {
    const response = await fetch('/api/audit');
    const data = await response.json();
    
    if (response.ok) {
        auditMetrics = data.metrics;
        renderAuditDashboard();
        renderMitigations();
        renderCertificate();
    }
}

// Render Auditor Tab (Gauge & Charts)
function renderAuditDashboard() {
    const metrics = auditMetrics;
    const colors = getThemeChartColors();
    
    // Set Badge Level UI
    const scoreText = document.getElementById('certBadgeText');
    const badgeCert = document.getElementById('badgeCertLevel');
    
    scoreText.className = 'compliance-badge-large';
    badgeCert.className = 'meta-badge';
    
    const lvl = metrics.certification_level;
    scoreText.textContent = lvl;
    badgeCert.querySelector('span').textContent = `Rating: ${lvl}`;
    
    if (lvl === 'GOLD') {
        scoreText.classList.add('gold');
        badgeCert.classList.add('pass');
    } else if (lvl === 'SILVER') {
        scoreText.classList.add('silver');
        badgeCert.classList.add('pass');
    } else if (lvl === 'BRONZE') {
        scoreText.classList.add('bronze');
        badgeCert.classList.add('warning');
    } else {
        scoreText.classList.add('fail');
        badgeCert.classList.add('fail');
    }
    
    // 1. Render Gauge Score Chart
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
    Plotly.newPlot('complianceGauge', gaugeData, gaugeLayout, { displayModeBar: false });
    
    // 2. Render Scorecard Table Row
    const tableBody = document.getElementById('metricsTableBody');
    tableBody.innerHTML = '';
    
    const scoreRows = [
        { name: 'Disparate Impact Ratio', val: metrics.disparate_impact_ratio, thresh: '>= 0.80', pass: metrics.disparate_impact_ratio >= 0.80, format: v => v.toFixed(3) },
        { name: 'Demographic Parity Diff', val: metrics.demographic_parity_difference, thresh: '<= 0.10', pass: metrics.demographic_parity_difference <= 0.10, format: v => v.toFixed(3) },
        { name: 'Equal Opportunity Diff (TPR)', val: metrics.equal_opportunity_difference, thresh: '<= 0.10', pass: metrics.equal_opportunity_difference <= 0.10, format: v => v.toFixed(3) },
        { name: 'Equalized Odds Difference', val: metrics.equalized_odds_difference, thresh: '<= 0.15', pass: metrics.equalized_odds_difference <= 0.15, format: v => v.toFixed(3) }
    ];
    
    scoreRows.forEach(row => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.textContent = row.name;
        
        const tdVal = document.createElement('td');
        tdVal.textContent = row.format(row.val);
        tdVal.style.fontWeight = '600';
        
        const tdThresh = document.createElement('td');
        tdThresh.textContent = row.thresh;
        
        const tdStatus = document.createElement('td');
        const span = document.createElement('span');
        span.className = row.pass ? 'badge-status pass' : 'badge-status fail';
        span.textContent = row.pass ? 'PASS' : 'FAIL';
        tdStatus.appendChild(span);
        
        tr.appendChild(tdName);
        tr.appendChild(tdVal);
        tr.appendChild(tdThresh);
        tr.appendChild(tdStatus);
        
        tableBody.appendChild(tr);
    });
    
    // 3. Render Selection Rates Chart
    const groups = Object.keys(metrics.group_stats);
    const selectionRates = groups.map(g => metrics.group_stats[g].selection_rate);
    
    const selChartData = [{
        x: groups,
        y: selectionRates,
        type: 'bar',
        marker: { color: colors.colorScale[0] },
        text: selectionRates.map(v => `${(v * 100).toFixed(1)}%`),
        textposition: 'auto'
    }];
    
    const selLayout = {
        margin: { t: 20, b: 40, l: 40, r: 20 },
        paper_bgcolor: colors.paperBg,
        plot_bgcolor: colors.plotBg,
        font: { color: colors.textColor, family: 'Inter, sans-serif' },
        xaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor },
        yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor, tickformat: ',.0%' }
    };
    Plotly.newPlot('selectionRateChart', selChartData, selLayout, { responsive: true, displayModeBar: false });
    
    // 4. Render TPR Chart (Equal Opportunity)
    const tprs = groups.map(g => metrics.group_stats[g].tpr);
    
    const tprChartData = [{
        x: groups,
        y: tprs,
        type: 'bar',
        marker: { color: colors.colorScale[1] },
        text: tprs.map(v => `${(v * 100).toFixed(1)}%`),
        textposition: 'auto'
    }];
    
    const tprLayout = {
        margin: { t: 20, b: 40, l: 40, r: 20 },
        paper_bgcolor: colors.paperBg,
        plot_bgcolor: colors.plotBg,
        font: { color: colors.textColor, family: 'Inter, sans-serif' },
        xaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor },
        yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor, tickformat: ',.0%' }
    };
    Plotly.newPlot('tprChart', tprChartData, tprLayout, { responsive: true, displayModeBar: false });
}

// Global Feature Importance Calculations
let globalImportances = [];
async function runGlobalExplain() {
    const response = await fetch('/api/explain/global');
    const data = await response.json();
    
    if (response.ok) {
        globalImportances = data.importances;
        renderGlobalImportance();
    }
}

function renderGlobalImportance() {
    if (globalImportances.length === 0) return;
    
    const colors = getThemeChartColors();
    // Sort in reverse order for horizontal bar chart
    const dataSorted = [...globalImportances].reverse();
    
    const features = dataSorted.map(x => x.feature);
    const scores = dataSorted.map(x => x.importance);
    
    const chartData = [{
        type: 'bar',
        x: scores,
        y: features,
        orientation: 'h',
        marker: {
            color: scores,
            colorscale: 'Viridis'
        }
    }];
    
    const layout = {
        margin: { t: 20, b: 40, l: 120, r: 20 },
        paper_bgcolor: colors.paperBg,
        plot_bgcolor: colors.plotBg,
        font: { color: colors.textColor, family: 'Inter, sans-serif' },
        xaxis: { title: 'Relative Importance Score', gridcolor: colors.gridColor, linecolor: colors.gridColor },
        yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor }
    };
    
    Plotly.newPlot('globalImportanceChart', chartData, layout, { responsive: true, displayModeBar: false });
}

// Load test dataset samples
async function loadTestSamples() {
    const response = await fetch('/api/dataset/samples?limit=15');
    const data = await response.json();
    
    if (response.ok) {
        renderInstancesTable(data.samples, data.sensitive_column);
    }
}

function renderInstancesTable(samples, sensitiveCol) {
    const header = document.getElementById('instancesTableHeader');
    header.innerHTML = '';
    
    // Create headers: Index, Sensitive Val, Ground Truth, Predicted Value
    const thIdx = document.createElement('th'); thIdx.textContent = 'Idx';
    const thSens = document.createElement('th'); thSens.textContent = sensitiveCol;
    const thTrue = document.createElement('th'); thTrue.textContent = 'Actual Y';
    const thPred = document.createElement('th'); thPred.textContent = 'Pred Y';
    
    header.appendChild(thIdx);
    header.appendChild(thSens);
    header.appendChild(thTrue);
    header.appendChild(thPred);
    
    const body = document.getElementById('instancesTableBody');
    body.innerHTML = '';
    
    samples.forEach(sample => {
        const tr = document.createElement('tr');
        tr.dataset.index = sample.__index;
        
        tr.addEventListener('click', () => {
            // Select row in list
            document.querySelectorAll('#instancesTableBody tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            
            // Get local explanation
            activeRowIndex = sample.__index;
            loadLocalExplanation(sample.__index);
        });
        
        const tdIdx = document.createElement('td'); tdIdx.textContent = sample.__index;
        const tdSens = document.createElement('td'); tdSens.textContent = sample[sensitiveCol];
        
        const tdTrue = document.createElement('td');
        const spanTrue = document.createElement('span');
        spanTrue.className = sample.__y_true === 1 ? 'badge-y positive' : 'badge-y negative';
        spanTrue.textContent = sample.__y_true === 1 ? '1 (>50K)' : '0 (<=50)';
        tdTrue.appendChild(spanTrue);
        
        const tdPred = document.createElement('td');
        const spanPred = document.createElement('span');
        spanPred.className = sample.__y_pred === 1 ? 'badge-y positive' : 'badge-y negative';
        spanPred.textContent = sample.__y_pred === 1 ? '1 (>50K)' : '0 (<=50)';
        tdPred.appendChild(spanPred);
        
        tr.appendChild(tdIdx);
        tr.appendChild(tdSens);
        tr.appendChild(tdTrue);
        tr.appendChild(tdPred);
        
        body.appendChild(tr);
    });
}

// Load LIME explanation for selected row
async function loadLocalExplanation(rowIndex) {
    const explanationPanel = document.getElementById('localExplanationPanel');
    const content = document.getElementById('localExpContent');
    
    content.innerHTML = `
        <div class="centered-placeholder">
            <div class="spinner" style="width: 32px; height: 32px;"></div>
            <p>Fitting local LIME model for index ${rowIndex}...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/explain/local/${rowIndex}`);
        const data = await response.json();
        
        if (response.ok) {
            renderLocalLIMEExplanation(data);
        } else {
            content.innerHTML = `<p class="text-center" style="color:var(--accent-danger)">Error: ${data.detail}</p>`;
        }
    } catch (err) {
        console.error(err);
        content.innerHTML = `<p class="text-center" style="color:var(--accent-danger)">Failed to connect to backend.</p>`;
    }
}

function renderLocalLIMEExplanation(data) {
    const content = document.getElementById('localExpContent');
    content.innerHTML = '';
    
    // Info headers
    const metaDiv = document.createElement('div');
    metaDiv.className = 'local-meta-info';
    metaDiv.style.marginBottom = '16px';
    metaDiv.style.fontSize = '13px';
    
    const probPct = (data.prediction_probability * 100).toFixed(1);
    metaDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
            <span>Instance Selected: <strong>#${data.row_index}</strong></span>
            <span>Prediction Class: <strong class="badge-y ${data.prediction_class === 1 ? 'positive' : 'negative'}">${data.prediction_class === 1 ? 'Positive (1)' : 'Negative (0)'}</strong></span>
        </div>
        <div>Model Probability output: <strong>${probPct}%</strong> (chance of positive outcome)</div>
    `;
    content.appendChild(metaDiv);
    
    // Create Chart Element
    const chartDiv = document.createElement('div');
    chartDiv.id = 'localLimeChart';
    chartDiv.style.height = '320px';
    content.appendChild(chartDiv);
    
    // Sort in ascending value of contribution for Plotly horizontal bars
    const contributions = [...data.contributions].reverse();
    
    const features = contributions.map(c => `${c.feature} = ${c.value}`);
    const values = contributions.map(c => c.contribution);
    
    // Color code features pushing towards 1 (Teal) vs 0 (Red)
    const barColors = values.map(v => v >= 0 ? 'rgba(20, 184, 166, 0.85)' : 'rgba(239, 68, 68, 0.85)');
    
    const chartData = [{
        type: 'bar',
        x: values,
        y: features,
        orientation: 'h',
        marker: { color: barColors }
    }];
    
    const colors = getThemeChartColors();
    const layout = {
        margin: { t: 10, b: 40, l: 150, r: 20 },
        paper_bgcolor: colors.paperBg,
        plot_bgcolor: colors.plotBg,
        font: { color: colors.textColor, family: 'Inter, sans-serif', size: 11 },
        xaxis: { title: 'Contribution Weight (LIME Coefficients)', gridcolor: colors.gridColor, linecolor: colors.gridColor },
        yaxis: { gridcolor: colors.gridColor, linecolor: colors.gridColor }
    };
    
    Plotly.newPlot('localLimeChart', chartData, layout, { responsive: true, displayModeBar: false });
}

// Render Recommendations Tab
function renderMitigations() {
    const container = document.getElementById('recommendationsContainer');
    container.innerHTML = '';
    
    const recs = auditMetrics.recommendations;
    
    if (recs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-square-check" style="color:var(--accent-success)"></i>
                <p>Everything looks great! No critical ethical violations detected.</p>
            </div>
        `;
        return;
    }
    
    recs.forEach(rec => {
        const div = document.createElement('div');
        div.className = `rec-card ${rec.type}`;
        
        const header = document.createElement('div');
        header.className = 'rec-header';
        
        const h4 = document.createElement('h4');
        h4.textContent = rec.title;
        
        const badge = document.createElement('span');
        badge.className = 'rec-type-badge';
        badge.textContent = rec.type;
        
        header.appendChild(h4);
        header.appendChild(badge);
        
        const detail = document.createElement('div');
        detail.className = 'rec-detail';
        detail.textContent = rec.detail;
        
        div.appendChild(header);
        div.appendChild(detail);
        container.appendChild(div);
    });
}

// Render Certification Report Tab
function renderCertificate() {
    const metrics = auditMetrics;
    const level = metrics.certification_level;
    
    // Fill in certificate HTML details
    const certFrame = document.getElementById('certificateFrame');
    const sealIcon = document.getElementById('certSealIcon');
    
    document.getElementById('certReportLevel').textContent = level;
    document.getElementById('certReportModel').textContent = modelTypeSelect.value === 'random_forest' ? 'Random Forest' : 'Logistic Regression';
    document.getElementById('certReportTarget').textContent = targetSelect.value;
    document.getElementById('certReportSensitive').textContent = sensitiveSelect.value;
    
    const accuracy = document.getElementById('badgeAccuracy').querySelector('span').textContent.replace('Accuracy: ', '');
    document.getElementById('certReportAccuracy').textContent = accuracy;
    document.getElementById('certReportScore').textContent = `${metrics.compliance_score} / 100`;
    
    // Update certificate border matching the compliance tier
    certFrame.className = 'certificate-border';
    
    if (level === 'GOLD') {
        certFrame.classList.add('gold');
        sealIcon.style.color = '#f59e0b';
    } else if (level === 'SILVER') {
        certFrame.classList.add('silver');
        sealIcon.style.color = '#9ca3af';
    } else if (level === 'BRONZE') {
        certFrame.classList.add('bronze');
        sealIcon.style.color = '#b45309';
    } else {
        certFrame.classList.add('fail');
        sealIcon.style.color = 'var(--accent-danger)';
    }
}

// Export Audit Report JSON
function exportJSONReport() {
    if (!auditMetrics) {
        alert("Train the model to generate a compliance report.");
        return;
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditMetrics, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href",     dataStr     );
    dlAnchorElem.setAttribute("download", `ethical_compliance_report_${modelTypeSelect.value}.json`);
    dlAnchorElem.click();
}
