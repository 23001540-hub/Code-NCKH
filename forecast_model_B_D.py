import pandas as pd
import numpy as np

# ĐỌC VÀ CHUẨN HÓA DỮ LIỆU
print("Đang tải dữ liệu...")
file_path = 'NHOM_SAN_PHAM_PHAN_KHUC.xlsx - KET_QUA_PHAN_KHUC_NCKH.csv'
df = pd.read_csv(file_path)
df.columns = df.columns.str.strip()
df['segment'] = df['segment'].astype(str).str.strip().str.upper()
df_bd = df[df['segment'].str.startswith('B') | df['segment'].str.startswith('D')]
df_pivot = df_bd.pivot_table(index=['group_name', 'segment'], columns='year_month', values='qty', aggfunc='sum').fillna(0)

# ĐỊNH NGHĨA THUẬT TOÁN CHO B & D
def model_naive(train): return train.iloc[-1] if len(train) > 0 else 0
def model_ma3(train): return train.iloc[-3:].mean() if len(train) >= 3 else (train.mean() if len(train) > 0 else 0)
def model_croston(train):
    non_zero = train[train > 0]
    if len(non_zero) == 0: return 0
    return non_zero.mean() / (np.diff(np.where(train > 0)[0]).mean() if len(np.diff(np.where(train > 0)[0])) > 0 else 1)
models = {'Naive': model_naive, 'MA3': model_ma3, 'Croston': model_croston}

def calc_metrics(actual, pred_val):
    actual, preds = np.array(actual), np.array([pred_val] * len(actual))
    mae, rmse = np.mean(np.abs(actual - preds)), np.sqrt(np.mean((actual - preds) ** 2))
    mask = actual != 0
    mape = np.mean(np.abs((actual[mask] - preds[mask]) / actual[mask])) * 100 if np.sum(mask) > 0 else (0.0 if np.sum(np.abs(actual - preds)) == 0 else 100.0)
    return mae, rmse, mape

# CHẠY BACKTESTING
print("Đang chạy Backtesting 3 tháng cuối...")
detailed_records = []
for (product, seg), series in df_pivot.iterrows():
    series = series.sort_index()
    train, val = series.iloc[:-3], series.iloc[-3:]
    best_model, best_mae, best_rmse, best_mape = None, float('inf'), 0, 0
    for m_name, m_func in models.items():
        mae, rmse, mape = calc_metrics(val.values, m_func(train))
        if mae < best_mae: best_model, best_mae, best_rmse, best_mape = m_name, mae, rmse, mape
    detailed_records.append({'Product': product, 'Segment': seg, 'Champion': best_model, 'MAE': round(best_mae, 2), 'RMSE': round(best_rmse, 2), 'MAPE': round(best_mape, 2)})

pd.DataFrame(detailed_records).to_csv("metrics_detail_B_D.csv", index=False, encoding='utf-8-sig')
print("Hoàn tất xuất file!")
