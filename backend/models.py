import numpy as np
import joblib
import pickle
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from typing import Dict, Any, Tuple, Optional

def generate_synthetic_census_data(num_samples: int = 1500, seed: int = 42) -> pd.DataFrame:
    """
    Generates a realistic synthetic census dataset for income prediction.
    Features: Age, Education, Gender, Race, Hours-Per-Week, Capital-Gain, Income (Target).
    Includes controlled biases (e.g., lower selection rate for Females/Minorities)
    so that fairness audit tools have clear signals to display.
    """
    np.random.seed(seed)
    
    # Generate features
    gender = np.random.choice(['Male', 'Female'], size=num_samples, p=[0.52, 0.48])
    race = np.random.choice(['White', 'Black', 'Asian', 'Hispanic'], size=num_samples, p=[0.70, 0.15, 0.08, 0.07])
    age = np.random.randint(18, 70, size=num_samples)
    
    # Education levels and corresponding numerical code
    edu_options = ['High School', 'Bachelors', 'Masters', 'Doctorate', 'Associate']
    edu_probs = [0.45, 0.35, 0.12, 0.03, 0.05]
    education = np.random.choice(edu_options, size=num_samples, p=edu_probs)
    
    edu_map = {'High School': 12, 'Associate': 14, 'Bachelors': 16, 'Masters': 18, 'Doctorate': 20}
    edu_num = np.array([edu_map[e] for e in education])
    
    # Hours worked per week
    hours_per_week = np.random.normal(40, 8, size=num_samples).astype(int)
    hours_per_week = np.clip(hours_per_week, 10, 80)
    
    # Generate Target: Income (>50K represented as 1, <=50K as 0)
    # Income probability depends on: Age, Education, Hours-Per-Week.
    # Introduce controlled bias:
    # 1. Females are assigned a slightly lower baseline probability (systemic gap).
    # 2. Race 'Black' and 'Hispanic' assigned a slightly lower baseline probability.
    
    base_logits = (
        0.05 * (age - 35) + 
        0.25 * (edu_num - 14) + 
        0.04 * (hours_per_week - 40)
    )
    
    # Apply demographic biases
    for i in range(num_samples):
        if gender[i] == 'Female':
            base_logits[i] -= 0.8  # Gender bias
        if race[i] in ['Black', 'Hispanic']:
            base_logits[i] -= 0.5  # Race bias
            
    # Add random noise
    base_logits += np.random.normal(0, 1.0, size=num_samples)
    
    # Sigmoid function for probability
    probs = 1 / (1 + np.exp(-base_logits))
    income = (probs > 0.5).astype(int)
    
    # Construct DataFrame
    df = pd.DataFrame({
        'Age': age,
        'Education': education,
        'Gender': gender,
        'Race': race,
        'Hours-Per-Week': hours_per_week,
        'Income': income
    })
    
    return df

class ModelManager:
    """
    Manages datasets and handles machine learning model training/inference pipelines.
    """
    def __init__(self):
        self.df: Optional[pd.DataFrame] = None
        self.pipeline: Optional[Pipeline] = None
        self.X_train: Optional[pd.DataFrame] = None
        self.X_test: Optional[pd.DataFrame] = None
        self.y_train: Optional[np.ndarray] = None
        self.y_test: Optional[np.ndarray] = None
        self.target_col: Optional[str] = None
        self.sensitive_col: Optional[str] = None
        self.model_source: str = 'trained'  # 'trained' or 'uploaded'
        self.uploaded_model_name: Optional[str] = None
        
    def load_benchmark(self):
        """Loads the synthetic census benchmark dataset."""
        self.df = generate_synthetic_census_data()
        self.target_col = 'Income'
        self.sensitive_col = 'Gender'
        
    def load_built_in(self, dataset_name: str):
        """Loads one of the built-in datasets generated in the datasets/ directory."""
        import os
        path = os.path.join("datasets", f"{dataset_name}.csv")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Built-in dataset file not found: {path}")
        self.df = pd.read_csv(path)
        
        # Configure defaults based on dataset name
        if dataset_name == 'german_credit':
            self.target_col = 'Credit-Risk'
            self.sensitive_col = 'Age-Group'
        elif dataset_name == 'college_admissions':
            self.target_col = 'Admitted'
            self.sensitive_col = 'Race'
        elif dataset_name == 'employee_promotion':
            self.target_col = 'Promoted'
            self.sensitive_col = 'Gender'
        elif dataset_name == 'recidivism_risk':
            self.target_col = 'High-Risk'
            self.sensitive_col = 'Race'
        else:
            raise ValueError(f"Unknown built-in dataset: {dataset_name}")
        
    def load_custom_csv(self, file_path: str, target_col: str, sensitive_col: str):
        """Loads a user uploaded CSV dataset."""
        self.df = pd.read_csv(file_path)
        if target_col not in self.df.columns or sensitive_col not in self.df.columns:
            raise ValueError(f"Columns '{target_col}' or '{sensitive_col}' not found in dataset.")
        self.target_col = target_col
        self.sensitive_col = sensitive_col

    def load_external_model(self, model_path: str, model_name: str):
        import os
        from backend.dl_wrappers import UniversalModelWrapper
        
        _, ext = os.path.splitext(model_name)
        try:
            # The wrapper automatically handles sklearn, PyTorch, TF, and ONNX
            self.pipeline = UniversalModelWrapper(model_path, ext)
        except Exception as e:
            raise ValueError(f"Failed to load the model file. Error: {e}")

        self.model_source = 'uploaded'
        self.uploaded_model_name = model_name

    def evaluate_uploaded_model(self, target_col: str, sensitive_col: str) -> Dict[str, Any]:
        """
        Applies the externally loaded model against the active dataset.
        Splits data, runs predictions, and returns performance metrics.
        """
        if self.df is None:
            raise ValueError("No dataset loaded. Load a dataset before evaluating an uploaded model.")
        if self.pipeline is None:
            raise ValueError("No model loaded. Upload a model file first.")

        self.target_col = target_col
        self.sensitive_col = sensitive_col

        X = self.df.drop(columns=[self.target_col])
        y = self.df[self.target_col].values

        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=0.3, random_state=42, stratify=y
        )

        y_pred = self.pipeline.predict(self.X_test)
        try:
            y_prob = self.pipeline.predict_proba(self.X_test)[:, 1]
            auc = float(roc_auc_score(self.y_test, y_prob))
        except Exception:
            auc = 0.5

        accuracy = float(accuracy_score(self.y_test, y_pred))

        # Detect model type name
        clf = self.pipeline
        if hasattr(clf, 'named_steps'):
            clf = clf.named_steps.get('classifier', clf)
        model_type_name = type(clf).__name__

        return {
            'accuracy': accuracy,
            'auc': auc,
            'test_size': len(self.y_test),
            'train_size': len(self.y_train),
            'model_type': model_type_name,
            'source': 'uploaded'
        }
        
    def train_model(self, model_type: str = 'random_forest') -> Dict[str, Any]:
        """
        Preprocesses the active dataset, splits it, trains a pipeline model,
        and evaluates standard performance metrics.
        """
        if self.df is None:
            raise ValueError("No dataset loaded.")
            
        X = self.df.drop(columns=[self.target_col])
        y = self.df[self.target_col].values
        
        # Split data
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=0.3, random_state=42, stratify=y
        )
        
        # Identify column types
        numerical_cols = X.select_dtypes(include=['int32', 'int64', 'float32', 'float64']).columns.tolist()
        categorical_cols = X.select_dtypes(include=['object', 'category']).columns.tolist()
        
        # Build preprocessor
        num_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        
        cat_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
        ])
        
        preprocessor = ColumnTransformer(transformers=[
            ('num', num_transformer, numerical_cols),
            ('cat', cat_transformer, categorical_cols)
        ])
        
        # Choose classifier
        if model_type == 'logistic_regression':
            clf = LogisticRegression(max_iter=1000, random_state=42)
        else:
            clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
            
        # Create pipeline
        self.pipeline = Pipeline(steps=[
            ('preprocessor', preprocessor),
            ('classifier', clf)
        ])
        
        # Train model
        self.pipeline.fit(self.X_train, self.y_train)
        
        # Predict & Evaluate
        y_pred = self.pipeline.predict(self.X_test)
        try:
            y_prob = self.pipeline.predict_proba(self.X_test)[:, 1]
            auc = float(roc_auc_score(self.y_test, y_prob))
        except Exception:
            auc = 0.5
            
        accuracy = float(accuracy_score(self.y_test, y_pred))
        
        return {
            'accuracy': accuracy,
            'auc': auc,
            'test_size': len(self.y_test),
            'train_size': len(self.y_train),
            'model_type': model_type
        }
        
    def get_test_predictions(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Returns (y_true, y_pred, sensitive_features) for the test set."""
        if self.pipeline is None or self.X_test is None:
            raise ValueError("Model is not trained yet.")
        y_pred = self.pipeline.predict(self.X_test)
        sensitive_vals = self.X_test[self.sensitive_col].values
        return self.y_test, y_pred, sensitive_vals
