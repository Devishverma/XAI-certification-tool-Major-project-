import numpy as np
import pandas as pd
from typing import Dict, Any, List

def compute_fairness_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    sensitive_features: np.ndarray
) -> Dict[str, Any]:
    """
    Computes fairness metrics across groups in sensitive_features.
    
    Metrics:
    - Selection Rate (by group and overall)
    - Demographic Parity Ratio & Difference
    - Equal Opportunity Ratio & Difference (True Positive Rate differences)
    - Disparate Impact Ratio
    - False Positive Rate (by group)
    - Equalized Odds Difference (max of TPR diff and FPR diff)
    """
    df = pd.DataFrame({
        'y_true': y_true,
        'y_pred': y_pred,
        'sensitive': sensitive_features
    })
    
    unique_groups = df['sensitive'].unique().tolist()
    # Handle string/numeric values gracefully
    unique_groups = [g for g in unique_groups if g is not None]
    
    overall_selection_rate = float(df['y_pred'].mean())
    
    group_stats = {}
    for group in unique_groups:
        group_df = df[df['sensitive'] == group]
        count = len(group_df)
        if count == 0:
            continue
            
        selection_rate = float(group_df['y_pred'].mean())
        
        # True Positive Rate (Equal Opportunity)
        positives = group_df[group_df['y_true'] == 1]
        tpr = float(positives['y_pred'].mean()) if len(positives) > 0 else 0.0
        
        # False Positive Rate
        negatives = group_df[group_df['y_true'] == 0]
        fpr = float(negatives['y_pred'].mean()) if len(negatives) > 0 else 0.0
        
        group_stats[str(group)] = {
            'count': count,
            'selection_rate': selection_rate,
            'tpr': tpr,
            'fpr': fpr
        }
    
    # Calculate differences and ratios
    selection_rates = [stats['selection_rate'] for stats in group_stats.values()]
    tprs = [stats['tpr'] for stats in group_stats.values()]
    fprs = [stats['fpr'] for stats in group_stats.values()]
    
    if len(selection_rates) > 1:
        # Demographic Parity
        min_sel = min(selection_rates)
        max_sel = max(selection_rates)
        demographic_parity_diff = max_sel - min_sel
        demographic_parity_ratio = min_sel / max_sel if max_sel > 0 else 1.0
        
        # Equal Opportunity (TPR)
        min_tpr = min(tprs)
        max_tpr = max(tprs)
        equal_opportunity_diff = max_tpr - min_tpr
        equal_opportunity_ratio = min_tpr / max_tpr if max_tpr > 0 else 1.0
        
        # Equalized Odds (Max of TPR diff and FPR diff)
        min_fpr = min(fprs)
        max_fpr = max(fprs)
        fpr_diff = max_fpr - min_fpr
        equalized_odds_diff = max(equal_opportunity_diff, fpr_diff)
    else:
        demographic_parity_diff = 0.0
        demographic_parity_ratio = 1.0
        equal_opportunity_diff = 0.0
        equal_opportunity_ratio = 1.0
        equalized_odds_diff = 0.0
        
    # Disparate Impact (strictly checking min selection rate / max selection rate)
    disparate_impact_ratio = demographic_parity_ratio
    
    # Compute overall Compliance Score (0-100)
    # 40% weight on Disparate Impact (needs to be >= 0.8)
    # 40% weight on Equal Opportunity Diff (needs to be <= 0.1)
    # 20% weight on Demographic Parity Diff (needs to be <= 0.1)
    di_score = min(1.0, disparate_impact_ratio) * 40
    eo_score = max(0.0, 1.0 - (equal_opportunity_diff * 5)) * 40  # 0.2 diff results in 0 score for this component
    dp_score = max(0.0, 1.0 - (demographic_parity_diff * 5)) * 20
    
    compliance_score = round(di_score + eo_score + dp_score, 1)
    
    # Determine Certification Level
    if compliance_score >= 90 and disparate_impact_ratio >= 0.85 and equal_opportunity_diff <= 0.05:
        certification_level = "GOLD"
    elif compliance_score >= 75 and disparate_impact_ratio >= 0.80 and equal_opportunity_diff <= 0.10:
        certification_level = "SILVER"
    elif compliance_score >= 60 and disparate_impact_ratio >= 0.70:
        certification_level = "BRONZE"
    else:
        certification_level = "NON-COMPLIANT"
        
    # Actionable Recommendations
    recommendations = generate_recommendations(
        group_stats=group_stats,
        disparate_impact_ratio=disparate_impact_ratio,
        equal_opportunity_diff=equal_opportunity_diff,
        demographic_parity_diff=demographic_parity_diff,
        certification_level=certification_level
    )
    
    return {
        'overall_selection_rate': overall_selection_rate,
        'group_stats': group_stats,
        'demographic_parity_difference': demographic_parity_diff,
        'demographic_parity_ratio': demographic_parity_ratio,
        'equal_opportunity_difference': equal_opportunity_diff,
        'equal_opportunity_ratio': equal_opportunity_ratio,
        'equalized_odds_difference': equalized_odds_diff,
        'disparate_impact_ratio': disparate_impact_ratio,
        'compliance_score': compliance_score,
        'certification_level': certification_level,
        'recommendations': recommendations
    }

def generate_recommendations(
    group_stats: Dict[str, Dict[str, float]],
    disparate_impact_ratio: float,
    equal_opportunity_diff: float,
    demographic_parity_diff: float,
    certification_level: str
) -> List[Dict[str, str]]:
    recs = []
    
    if certification_level == "GOLD":
        recs.append({
            'title': 'Model Certified Gold!',
            'type': 'success',
            'detail': 'The model meets highly rigorous ethical standards with extremely low bias across groups. Maintain standard model monitoring and re-audit periodically to ensure drift does not introduce bias.'
        })
        return recs
        
    # Disparate Impact
    if disparate_impact_ratio < 0.8:
        # Find group with lowest selection rate vs highest
        sorted_groups = sorted(group_stats.items(), key=lambda x: x[1]['selection_rate'])
        low_group, low_stats = sorted_groups[0]
        high_group, high_stats = sorted_groups[-1]
        
        recs.append({
            'title': 'Mitigate Disparate Impact (4/5ths Rule Violation)',
            'type': 'danger',
            'detail': f"The selection rate for group '{low_group}' ({low_stats['selection_rate']:.2%}) is significantly lower than for group '{high_group}' ({high_stats['selection_rate']:.2%}), resulting in a disparate impact ratio of {disparate_impact_ratio:.2f}. "
                      f"Consider applying preprocessing techniques like 'Re-weighing' the dataset to give more weight to positive instances in the '{low_group}' group, or adjusting the decision threshold dynamically per group."
        })
        
    # Equal Opportunity (TPR difference)
    if equal_opportunity_diff > 0.1:
        sorted_groups = sorted(group_stats.items(), key=lambda x: x[1]['tpr'])
        low_group, low_stats = sorted_groups[0]
        high_group, high_stats = sorted_groups[-1]
        
        recs.append({
            'title': 'Address True Positive Rate (TPR) Discrepancy',
            'type': 'warning',
            'detail': f"The model is less accurate at identifying qualified candidates for group '{low_group}' (TPR: {low_stats['tpr']:.2%}) compared to group '{high_group}' (TPR: {high_stats['tpr']:.2%}). "
                      f"To enforce Equal Opportunity, consider applying a post-processing algorithm (e.g., Fairlearn's ThresholdOptimizer) to find group-specific thresholds that equalize the True Positive Rates."
        })
        
    # Feature representation recommendation
    sizes = [stats['count'] for stats in group_stats.values()]
    max_size = max(sizes)
    for group, stats in group_stats.items():
        if stats['count'] < 0.3 * max_size:
            recs.append({
                'title': 'Improve Under-represented Group Sample Size',
                'type': 'info',
                'detail': f"Group '{group}' only has {stats['count']} samples, compared to the largest group with {max_size}. "
                          f"Small sample sizes can lead to unstable predictions and higher variance in fairness auditing. Consider collecting more representative data or using oversampling techniques."
            })
            
    # Generic advice if bronze or non-compliant
    if certification_level in ["BRONZE", "NON-COMPLIANT"]:
        recs.append({
            'title': 'Examine Feature Correlations',
            'type': 'info',
            'detail': 'Proxy variables in your dataset may be leaking sensitive group status. Perform correlation analyses between sensitive features and target predictors, and consider dropping highly correlated proxy features (e.g., ZIP code as a proxy for race).'
        })
        
    return recs
