import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.inspection import permutation_importance
from typing import Dict, Any, List, Tuple

def get_global_importance(
    model: Any,
    X: pd.DataFrame,
    y: np.ndarray
) -> List[Dict[str, Any]]:
    """
    Computes global feature importances.
    If the model has a native feature_importances_ attribute (e.g. Random Forest),
    we use it. Otherwise, we calculate permutation importance.
    """
    feature_names = X.columns.tolist()
    
    # Try native feature importances (e.g., from Random Forest)
    # Note: If model is a Pipeline, we check the last step (the classifier)
    classifier = model
    preprocessor = None
    if hasattr(model, 'steps'):
        preprocessor = model.steps[0][1]
        classifier = model.steps[-1][1]
        
    if hasattr(classifier, 'feature_importances_'):
        importances = classifier.feature_importances_
        # If there's a preprocessor, the number of features after preprocessing might differ
        # (e.g. One-Hot Encoding). In that case, we fall back to permutation importance
        # on the raw features, which is actually more interpretable globally for raw columns!
        if preprocessor is not None:
            # Let's run permutation importance because it evaluates raw columns before preprocessing
            return compute_permutation_importance(model, X, y)
        else:
            importance_list = []
            for name, imp in zip(feature_names, importances):
                importance_list.append({
                    'feature': name,
                    'importance': float(imp)
                })
            # Sort by importance descending
            importance_list.sort(key=lambda x: x['importance'], reverse=True)
            return importance_list
            
    # Fallback to permutation importance
    return compute_permutation_importance(model, X, y)

def compute_permutation_importance(
    model: Any,
    X: pd.DataFrame,
    y: np.ndarray
) -> List[Dict[str, Any]]:
    """
    Computes permutation feature importance on raw features.
    """
    # Sample a max of 500 rows to keep it fast
    if len(X) > 500:
        sample_idx = np.random.choice(len(X), size=500, replace=False)
        X_sample = X.iloc[sample_idx]
        y_sample = y[sample_idx]
    else:
        X_sample = X
        y_sample = y
        
    try:
        result = permutation_importance(
            model, X_sample, y_sample, 
            n_repeats=5, random_state=42, n_jobs=1
        )
        importances = result.importances_mean
    except Exception:
        # Emergency fallback if model doesn't support predict/score properly
        importances = np.ones(len(X.columns)) / len(X.columns)
        
    importance_list = []
    for name, imp in zip(X.columns, importances):
        importance_list.append({
            'feature': name,
            # Make sure it's non-negative for display
            'importance': max(0.0, float(imp))
        })
        
    # Normalize importances so they sum to 1
    total = sum(x['importance'] for x in importance_list)
    if total > 0:
        for x in importance_list:
            x['importance'] /= total
            
    importance_list.sort(key=lambda x: x['importance'], reverse=True)
    return importance_list

def explain_instance_lime(
    model: Any,
    instance: pd.Series,
    X_train: pd.DataFrame,
    num_samples: int = 500,
    random_state: int = 42
) -> List[Dict[str, Any]]:
    """
    Generates a LIME-like explanation for a single prediction.
    
    1. Perturb numerical features with Gaussian noise based on their training std.
    2. Perturb categorical features by sampling from their training marginal distribution.
    3. Generate model predictions (probabilities) for these perturbed samples.
    4. Compute similarity weights using an exponential kernel.
    5. Fit a weighted Ridge regression to estimate local feature contributions.
    """
    np.random.seed(random_state)
    n_features = len(X_train.columns)
    
    # 1. Create perturbed samples
    perturbed_data = []
    
    # Analyze columns
    numerical_cols = []
    categorical_cols = []
    stds = {}
    means = {}
    
    for col in X_train.columns:
        if pd.api.types.is_numeric_dtype(X_train[col]):
            numerical_cols.append(col)
            # Avoid std = 0
            stds[col] = max(1e-5, float(X_train[col].std(ddof=0)))
            means[col] = float(X_train[col].mean())
        else:
            categorical_cols.append(col)
            
    # Generate samples
    for _ in range(num_samples):
        sample = instance.copy()
        
        # Perturb numericals
        for col in numerical_cols:
            noise = np.random.normal(0, stds[col])
            sample[col] = sample[col] + noise
            
        # Perturb categoricals (50% chance to draw from training values)
        for col in categorical_cols:
            if np.random.rand() > 0.5:
                sample[col] = np.random.choice(X_train[col].dropna())
                
        perturbed_data.append(sample)
        
    # Add the instance itself as the first sample
    perturbed_df = pd.DataFrame(perturbed_data)
    perturbed_df.iloc[0] = instance
    
    # 2. Get predictions from model
    # Model predictions for positive class (assumes binary classification)
    try:
        preds = model.predict_proba(perturbed_df)[:, 1]
    except Exception:
        # Fallback for models without predict_proba (e.g. raw sklearn predictors)
        preds = model.predict(perturbed_df)
        
    # 3. Create interpretable representations for the Ridge regression
    # For numericals: (z - x) / std
    # For categoricals: 1 if z == x else 0
    interpretable_representations = np.zeros((num_samples, n_features))
    
    for idx, col in enumerate(X_train.columns):
        if col in numerical_cols:
            # Shifted and scaled
            interpretable_representations[:, idx] = (perturbed_df[col].values - instance[col]) / stds[col]
        else:
            # Binary indicator: 1 if matches target instance, 0 if different
            interpretable_representations[:, idx] = (perturbed_df[col].values == instance[col]).astype(float)
            
    # 4. Compute similarity weights
    # Compute Euclidean distance in the interpretable space
    # (for categoricals, if they match instance it is 1, so difference from instance(1) is 0; if they don't it is 0, difference is 1)
    # Difference from instance (instance is represented as numerical=0, categorical=1)
    instance_rep = np.zeros(n_features)
    for idx, col in enumerate(X_train.columns):
        if col in categorical_cols:
            instance_rep[idx] = 1.0
            
    distances = np.sqrt(np.sum((interpretable_representations - instance_rep) ** 2, axis=1))
    
    # Exponential kernel
    kernel_width = np.sqrt(n_features) * 0.75
    weights = np.exp(- (distances ** 2) / (kernel_width ** 2))
    
    # 5. Fit Ridge regression
    ridge = Ridge(alpha=1.0, fit_intercept=True)
    ridge.fit(interpretable_representations, preds, sample_weight=weights)
    
    # The coefficients represent the local feature contributions
    contributions = []
    for idx, col in enumerate(X_train.columns):
        coef = ridge.coef_[idx]
        
        # Calculate localized description of feature state
        val = instance[col]
        if col in numerical_cols:
            formatted_val = f"{val:.2f}"
        else:
            formatted_val = str(val)
            
        contributions.append({
            'feature': col,
            'value': formatted_val,
            'contribution': float(coef)
        })
        
    # Sort contributions by absolute magnitude descending
    contributions.sort(key=lambda x: abs(x['contribution']), reverse=True)
    
    return contributions

def explain_instance_shap(model, instance, X_train):
    import shap
    
    # Create background data from X_train
    background = shap.sample(X_train, 10)
    
    def predict_fn(x):
        if isinstance(x, np.ndarray):
            x = pd.DataFrame(x, columns=X_train.columns)
        return model.predict_proba(x)[:, 1]
        
    explainer = shap.KernelExplainer(predict_fn, background)
    
    instance_df = pd.DataFrame([instance])
    shap_values = explainer.shap_values(instance_df)
    
    # KernelExplainer returns a list if it predicts multiple classes, but our predict_fn is 1D
    sv = shap_values[0]
    
    contributions = []
    for idx, col in enumerate(X_train.columns):
        val = instance[col]
        if pd.api.types.is_numeric_dtype(X_train[col]):
            formatted_val = f"{val:.2f}"
        else:
            formatted_val = str(val)
            
        contributions.append({
            'feature': col,
            'value': formatted_val,
            'contribution': float(sv[idx])
        })
        
    contributions.sort(key=lambda x: abs(x['contribution']), reverse=True)
    return contributions
