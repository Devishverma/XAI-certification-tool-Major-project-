import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import json

# Import custom backend modules
from backend.models import ModelManager
from backend.fairness import compute_fairness_metrics
from backend.explain import get_global_importance, explain_instance_lime, explain_instance_shap

app = FastAPI(title="Explainable AI Certification Tool API")

# Setup CORS for React Dev Server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev purposes, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize global ModelManager
model_manager = ModelManager()

# Ensure temporary upload directory exists
UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class TrainRequest(BaseModel):
    model_type: str = "random_forest"
    target_col: str
    sensitive_col: str

@app.post("/api/dataset/load-benchmark")
async def load_benchmark():
    try:
        model_manager.load_benchmark()
        train_results = model_manager.train_model(model_type='random_forest')
        
        # Get column details
        cols = model_manager.df.columns.tolist()
        num_cols = model_manager.df.select_dtypes(include=['int32', 'int64', 'float32', 'float64']).columns.tolist()
        cat_cols = model_manager.df.select_dtypes(include=['object', 'category']).columns.tolist()
        
        return {
            "status": "success",
            "message": "Benchmark dataset 'Adult Census Income' loaded and default model trained.",
            "columns": cols,
            "numerical_columns": num_cols,
            "categorical_columns": cat_cols,
            "target_column": model_manager.target_col,
            "sensitive_column": model_manager.sensitive_col,
            "training": train_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dataset/load-built-in/{dataset_name}")
async def load_built_in_dataset(dataset_name: str):
    try:
        model_manager.load_built_in(dataset_name)
        train_results = model_manager.train_model(model_type='random_forest')
        
        # Get column details
        cols = model_manager.df.columns.tolist()
        num_cols = model_manager.df.select_dtypes(include=['int32', 'int64', 'float32', 'float64', 'number']).columns.tolist()
        cat_cols = model_manager.df.select_dtypes(exclude=['int32', 'int64', 'float32', 'float64', 'number']).columns.tolist()
        
        return {
            "status": "success",
            "message": f"Built-in dataset '{dataset_name}' loaded and default model trained.",
            "columns": cols,
            "numerical_columns": num_cols,
            "categorical_columns": cat_cols,
            "target_column": model_manager.target_col,
            "sensitive_column": model_manager.sensitive_col,
            "training": train_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dataset/upload")
async def upload_dataset(
    file: UploadFile = File(...),
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
        
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Temporarily read columns to send to frontend for mapping
        df_temp = pd.read_csv(file_path, nrows=5)
        cols = df_temp.columns.tolist()
        num_cols = df_temp.select_dtypes(include=['number']).columns.tolist()
        cat_cols = df_temp.select_dtypes(exclude=['number']).columns.tolist()
        
        return {
            "status": "success",
            "message": "CSV uploaded successfully.",
            "file_path": file_path,
            "columns": cols,
            "numerical_columns": num_cols,
            "categorical_columns": cat_cols
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/model/upload")
async def upload_model(
    file: UploadFile = File(...),
):
    valid_extensions = ('.pkl', '.joblib', '.h5', '.pt', '.pth', '.onnx')
    if not file.filename.endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Only .pkl, .joblib, .h5, .pt, .pth, and .onnx files are supported.")
        
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        model_manager.load_external_model(file_path, file.filename)
        
        return {
            "status": "success",
            "message": f"Model {file.filename} uploaded successfully.",
            "file_path": file_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/model/train")
async def train_model(
    file_path: Optional[str] = Form(None),
    model_type: str = Form("random_forest"),
    target_col: str = Form(...),
    sensitive_col: str = Form(...),
    use_uploaded_model: bool = Form(False),
    builtin_model: Optional[str] = Form(None)
):
    try:
        if file_path and os.path.exists(file_path):
            model_manager.load_custom_csv(file_path, target_col, sensitive_col)
        elif model_manager.df is None:
            model_manager.load_benchmark()
            
        model_manager.target_col = target_col
        model_manager.sensitive_col = sensitive_col
        
        if use_uploaded_model:
            train_results = model_manager.evaluate_uploaded_model(target_col, sensitive_col)
            model_label = train_results.get("model_type", "Uploaded Model")
        elif builtin_model:
            model_path = os.path.join("pretrained_models", builtin_model)
            if not os.path.exists(model_path):
                raise HTTPException(status_code=404, detail="Built-in model not found.")
            model_manager.load_external_model(model_path, builtin_model)
            train_results = model_manager.evaluate_uploaded_model(target_col, sensitive_col)
            model_label = builtin_model
        else:
            train_results = model_manager.train_model(model_type=model_type)
            model_label = model_type

        return {
            "status": "success",
            "message": f"Model '{model_label}' applied on '{target_col}' with sensitive attribute '{sensitive_col}'.",
            "training": train_results
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dataset/samples")
async def get_dataset_samples(limit: int = 15):
    """
    Returns the first N sample rows from the Test set,
    along with their ground truth labels and model predictions.
    """
    if model_manager.X_test is None or model_manager.pipeline is None:
        raise HTTPException(status_code=400, detail="Model is not trained. Please load dataset and train model first.")
        
    try:
        # Get first N rows of test set
        X_sample = model_manager.X_test.head(limit).copy()
        y_true_sample = model_manager.y_test[:limit]
        
        # Predict
        y_pred_sample = model_manager.pipeline.predict(X_sample)
        
        # Add labels
        X_sample['__y_true'] = [int(val) for val in y_true_sample]
        X_sample['__y_pred'] = [int(val) for val in y_pred_sample]
        # Store original index as a column
        X_sample['__index'] = X_sample.index.tolist()
        
        # Convert to records
        records = X_sample.to_dict(orient='records')
        
        return {
            "status": "success",
            "samples": records,
            "target_column": model_manager.target_col,
            "sensitive_column": model_manager.sensitive_col
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/audit")
async def run_audit():
    """Runs the fairness metrics calculations on test data and saves to DB."""
    if model_manager.pipeline is None:
        raise HTTPException(status_code=400, detail="Model is not trained. Please train the model first.")
        
    try:
        y_true, y_pred, sensitive_features = model_manager.get_test_predictions()
        metrics = compute_fairness_metrics(y_true, y_pred, sensitive_features)

        return {
            "status": "success",
            "metrics": metrics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/explain/global")
async def explain_global():
    """Computes global feature importances."""
    if model_manager.pipeline is None:
        raise HTTPException(status_code=400, detail="Model is not trained. Please train the model first.")
        
    try:
        importances = get_global_importance(
            model_manager.pipeline, 
            model_manager.X_test, 
            model_manager.y_test
        )
        return {
            "status": "success",
            "importances": importances
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/explain/local/{row_index}")
async def explain_local(row_index: int):
    """Computes a local LIME explanation for a specific row index of the active dataset."""
    if model_manager.df is None or model_manager.pipeline is None:
        raise HTTPException(status_code=400, detail="Model/dataset is not trained/loaded.")
        
    try:
        # Find index in full dataset
        if row_index not in model_manager.df.index:
            raise HTTPException(status_code=404, detail=f"Row index {row_index} not found in dataset.")
            
        instance = model_manager.df.loc[row_index].drop(labels=[model_manager.target_col])
        X_train = model_manager.X_train
        
        # Predict probability for positive class
        instance_df = pd.DataFrame([instance])
        try:
            prob = float(model_manager.pipeline.predict_proba(instance_df)[0, 1])
        except Exception:
            prob = float(model_manager.pipeline.predict(instance_df)[0])
            
        contributions = explain_instance_lime(
            model=model_manager.pipeline,
            instance=instance,
            X_train=X_train
        )
        
        return {
            "status": "success",
            "row_index": row_index,
            "prediction_probability": prob,
            "prediction_class": 1 if prob > 0.5 else 0,
            "contributions": contributions
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/explain/local/shap/{row_index}")
async def explain_local_shap(row_index: int):
    """Computes a local SHAP explanation for a specific row index of the active dataset."""
    if model_manager.df is None or model_manager.pipeline is None:
        raise HTTPException(status_code=400, detail="Model/dataset is not trained/loaded.")
        
    try:
        # Find index in full dataset
        if row_index not in model_manager.df.index:
            raise HTTPException(status_code=404, detail=f"Row index {row_index} not found in dataset.")
            
        instance = model_manager.df.loc[row_index].drop(labels=[model_manager.target_col])
        X_train = model_manager.X_train
        
        # Predict probability for positive class
        instance_df = pd.DataFrame([instance])
        try:
            prob = float(model_manager.pipeline.predict_proba(instance_df)[0, 1])
        except Exception:
            prob = float(model_manager.pipeline.predict(instance_df)[0])
            
        contributions = explain_instance_shap(
            model=model_manager.pipeline,
            instance=instance,
            X_train=X_train
        )
        
        return {
            "status": "success",
            "row_index": row_index,
            "prediction_probability": prob,
            "prediction_class": 1 if prob > 0.5 else 0,
            "contributions": contributions
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Setup frontend static directories
frontend_dir = os.path.abspath("frontend")
os.makedirs(os.path.join(frontend_dir, "css"), exist_ok=True)
os.makedirs(os.path.join(frontend_dir, "js"), exist_ok=True)

# Mount the static folder at /static
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.get("/")
async def read_index():
    """Serves the index.html page at root."""
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h2>Frontend index.html not found. Please wait until files are generated.</h2>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
