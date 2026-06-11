import os
import pandas as pd
import numpy as np

# Ensure datasets directory exists
os.makedirs("./datasets", exist_ok=True)

def generate_german_credit(num_samples=1000, seed=42):
    """
    German Credit Risk dataset. Target: Credit-Risk (1=Good, 0=Bad).
    Sensitive Attribute: Age-Group (Young: Age < 25 vs Old: Age >= 25).
    Minor bias against young applicants.
    """
    np.random.seed(seed)
    age = np.random.randint(18, 75, size=num_samples)
    age_group = np.where(age < 25, 'Young', 'Adult')
    
    housing = np.random.choice(['Own', 'Rent', 'Free'], size=num_samples, p=[0.70, 0.20, 0.10])
    job = np.random.choice(['Unskilled', 'Skilled', 'Management'], size=num_samples, p=[0.25, 0.60, 0.15])
    
    credit_amount = np.random.exponential(scale=3000, size=num_samples) + 500
    credit_amount = np.clip(credit_amount, 500, 15000).astype(int)
    
    duration = (credit_amount / 200 + np.random.normal(6, 4, size=num_samples)).astype(int)
    duration = np.clip(duration, 4, 72)
    
    # Calculate probability of good credit
    base_logits = (
        0.8 * (housing == 'Own').astype(float) - 
        0.5 * (housing == 'Free').astype(float) +
        0.3 * (job == 'Management').astype(float) -
        0.04 * (duration - 12) -
        0.0001 * (credit_amount - 3000)
    )
    
    # Minor age bias (young applicants have slightly higher risk)
    for i in range(num_samples):
        if age_group[i] == 'Young':
            base_logits[i] -= 0.45
            
    base_logits += np.random.normal(0, 0.8, size=num_samples)
    probs = 1 / (1 + np.exp(-base_logits))
    credit_risk = (probs > 0.45).astype(int) # slightly lower threshold for realistic distribution
    
    df = pd.DataFrame({
        'Age': age,
        'Age-Group': age_group,
        'Housing': housing,
        'Job-Type': job,
        'Credit-Amount': credit_amount,
        'Duration-Months': duration,
        'Credit-Risk': credit_risk
    })
    df.to_csv('./datasets/german_credit.csv', index=False)
    print("Generated datasets/german_credit.csv")

def generate_college_admissions(num_samples=1200, seed=42):
    """
    College Admissions dataset. Target: Admitted (1=Yes, 0=No).
    Sensitive Attribute: Race (White, Black, Hispanic, Asian).
    Significant historical/structural bias against Black/Hispanic groups,
    and legacy boost. Non-Compliant.
    """
    np.random.seed(seed + 1)
    race = np.random.choice(['White', 'Black', 'Hispanic', 'Asian'], size=num_samples, p=[0.60, 0.18, 0.14, 0.08])
    gpa = np.random.normal(3.2, 0.4, size=num_samples)
    gpa = np.clip(gpa, 2.0, 4.0)
    
    sat = (gpa * 300 + 400 + np.random.normal(0, 80, size=num_samples)).astype(int)
    sat = np.clip(sat, 800, 1600)
    
    extra_curriculars = np.random.poisson(lam=2, size=num_samples)
    extra_curriculars = np.clip(extra_curriculars, 0, 8)
    
    legacy = np.random.choice([0, 1], size=num_samples, p=[0.92, 0.08])
    
    base_logits = (
        2.5 * (gpa - 3.0) +
        0.005 * (sat - 1200) +
        0.3 * extra_curriculars +
        1.5 * legacy
    )
    
    # Introduce race bias
    for i in range(num_samples):
        if race[i] == 'Black':
            base_logits[i] -= 1.1
        elif race[i] == 'Hispanic':
            base_logits[i] -= 0.8
            
    base_logits += np.random.normal(0, 0.7, size=num_samples)
    probs = 1 / (1 + np.exp(-base_logits))
    admitted = (probs > 0.5).astype(int)
    
    df = pd.DataFrame({
        'Race': race,
        'GPA': gpa,
        'SAT-Score': sat,
        'Extra-Curriculars': extra_curriculars,
        'Legacy-Status': legacy,
        'Admitted': admitted
    })
    df.to_csv('./datasets/college_admissions.csv', index=False)
    print("Generated datasets/college_admissions.csv")

def generate_employee_promotion(num_samples=1000, seed=42):
    """
    Employee Promotion dataset. Target: Promoted (1=Yes, 0=No).
    Sensitive Attribute: Gender (Male, Female).
    Almost no bias. Passes at GOLD/SILVER.
    """
    np.random.seed(seed + 2)
    gender = np.random.choice(['Male', 'Female'], size=num_samples, p=[0.50, 0.50])
    perf_rating = np.random.choice([1, 2, 3, 4, 5], size=num_samples, p=[0.05, 0.15, 0.50, 0.20, 0.10])
    years = np.random.randint(1, 15, size=num_samples)
    training_hours = np.random.normal(45, 12, size=num_samples).astype(int)
    training_hours = np.clip(training_hours, 10, 100)
    
    base_logits = (
        0.9 * (perf_rating - 3) +
        0.15 * years +
        0.02 * (training_hours - 40) -
        1.2 # shift base promotion rate down
    )
    
    # Very minor noise-level gender bias (almost equal opportunity)
    for i in range(num_samples):
        if gender[i] == 'Female':
            base_logits[i] += 0.05 # slightly positive to offset any small split variance
            
    base_logits += np.random.normal(0, 0.5, size=num_samples)
    probs = 1 / (1 + np.exp(-base_logits))
    promoted = (probs > 0.5).astype(int)
    
    df = pd.DataFrame({
        'Gender': gender,
        'Performance-Rating': perf_rating,
        'Years-At-Company': years,
        'Training-Hours': training_hours,
        'Promoted': promoted
    })
    df.to_csv('./datasets/employee_promotion.csv', index=False)
    print("Generated datasets/employee_promotion.csv")

def generate_recidivism_risk(num_samples=1200, seed=42):
    """
    Recidivism Risk (COMPAS-like) dataset. Target: High-Risk (1=Yes, 0=No).
    Sensitive Attribute: Race (White, Black, Other).
    High racial bias (higher false positive rate for Black individuals).
    Non-Compliant.
    """
    np.random.seed(seed + 3)
    race = np.random.choice(['White', 'Black', 'Other'], size=num_samples, p=[0.55, 0.35, 0.10])
    age = np.random.randint(18, 65, size=num_samples)
    priors = np.random.poisson(lam=1.5, size=num_samples)
    priors = np.clip(priors, 0, 12)
    charge = np.random.choice(['Felony', 'Misdemeanor'], size=num_samples, p=[0.40, 0.60])
    
    base_logits = (
        0.4 * priors - 
        0.03 * (age - 35) + 
        0.6 * (charge == 'Felony').astype(float) -
        0.8
    )
    
    # Introduce racial bias (Black defendants assigned higher logits for recidivism classification)
    for i in range(num_samples):
        if race[i] == 'Black':
            base_logits[i] += 0.75
            
    base_logits += np.random.normal(0, 0.6, size=num_samples)
    probs = 1 / (1 + np.exp(-base_logits))
    recidivate = (probs > 0.5).astype(int)
    
    df = pd.DataFrame({
        'Race': race,
        'Age': age,
        'Prior-Convictions': priors,
        'Charge-Degree': charge,
        'High-Risk': recidivate
    })
    df.to_csv('./datasets/recidivism_risk.csv', index=False)
    print("Generated datasets/recidivism_risk.csv")

if __name__ == "__main__":
    generate_german_credit()
    generate_college_admissions()
    generate_employee_promotion()
    generate_recidivism_risk()
