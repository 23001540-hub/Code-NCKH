# Code-NCKH
import pandas as pd
import numpy as np
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error

# --- STEP 1, 2, 3: DATA PREPARATION ---
def get_processed_data(file_path):
    df = pd.read_csv(file_path)
    df['year_month'] = pd.to_datetime(df['year_month'])
    df = df.sort_values(['fsku', 'year_month'])

    # Feature Engineering (Step 5)
    df['lag_1'] = df.groupby('fsku')['qty'].shift(1)
    df['lag_2'] = df.groupby('fsku')['qty'].shift(2)
    df['rolling_mean_3'] = df.groupby('fsku')['qty'].transform(lambda x: x.shift(1).rolling(window=3).mean())
    df['month'] = df['year_month'].dt.month
    
    return df.dropna()

# --- STEP 4: TIME-SERIES SPLIT (TRAIN/TEST) ---
def split_data(df):
    # Cắt 3 tháng cuối làm Test để đối soát MAE
    last_date = df['year_month'].max()
    threshold = last_date - pd.DateOffset(months=2)
    
    train = df[df['year_month'] < threshold]
    test = df[df['year_month'] >= threshold]
    return train, test

# --- STEP 6, 7: XGBOOST TRAINING & EVALUATION ---
def run_model_group2(train, test):
    features = ['lag_1', 'lag_2', 'rolling_mean_3', 'month']
    target = 'qty'
    
    model = XGBRegressor(
        n_estimators=1000,
        learning_rate=0.01,
        max_depth=6,
        random_state=42
    )
    
    model.fit(train[features], train[target])
    
    preds = model.predict(test[features])
    mae = mean_absolute_error(test[target], preds)
    return model, mae

# --- STEP 8: ROLLING FORECAST Q1/2026 ---
def forecast_q1_2026(model, current_data):
    # Logic dự báo tịnh tiến cho tháng 1, 2, 3/2026
    forecast_results = []
    # Implementation logic here...
    return forecast_results

# --- EXECUTION ---
if __name__ == "__main__":
    # path = 'fsku_classification_results.csv'
    # df = get_processed_data(path)
    # train, test = split_data(df)
    # model, mae = run_model_group2(train, test)
    # print(f"MAE Group 2: {mae}")
    pass
