import pandas as pd
import numpy as np

# 1. ĐỌC VÀ CHUẨN HÓA DỮ LIỆU
print("Đang tải dữ liệu...")
file_path = 'NHOM_SAN_PHAM_PHAN_KHUC.xlsx - KET_QUA_PHAN_KHUC_NCKH.csv'
df = pd.read_csv(file_path)
df.columns = df.columns.str.strip()
df['segment'] = df['segment'].astype(str).str.strip().str.upper()
df_bd = df[df['segment'].str.startswith('B') | df['segment'].str.startswith('D')]
df_pivot = df_bd.pivot_table(index=['group_name', 'segment'], columns='year_month', values='qty', aggfunc='sum').fillna(0)

# 2. ĐỊNH NGHĨA THUẬT TOÁN CHO B & D
def model_naive(train): return train.iloc[-1] if len(train) > 0 else 0
def model_ma3(train): return train.iloc[-3:].mean() if len(train) >= 3 else (train.mean() if len(train) > 0 else 0)
def model_croston(train):
    non_zero = train[train > 0]
    if len(non_zero) == 0: return 0
    demand_size = non_zero.mean()
    intervals = np.diff(np.where(train > 0)[0])
    demand_interval = intervals.mean() if len(intervals) > 0 else 1
    return demand_size / demand_interval

models = {'Naive': model_naive, 'MA3': model_ma3, 'Croston': model_croston}

# 3. HÀM TÍNH WAPE CHUẨN CHUỖI CUNG ỨNG
def calc_wape(actual, pred_val):
    actual, preds = np.array(actual), np.array([pred_val] * len(actual))
    sum_actual = np.sum(actual)
    if sum_actual == 0: return float('inf') # Loại bỏ lỗi chia cho 0
    return (np.sum(np.abs(actual - preds)) / sum_actual) * 100

# 4. CHẠY BACKTESTING
print("Đang chạy Backtesting 3 tháng cuối với bộ đo WAPE...")
detailed_records = []
for (product, seg), series in df_pivot.iterrows():
    series = series.sort_index()
    train, val = series.iloc[:-3], series.iloc[-3:]
    
    best_model, best_wape = None, float('inf')
    
    for m_name, m_func in models.items():
        wape = calc_wape(val.values, m_func(train))
        
        if wape < best_wape:
            best_model, best_wape = m_name, wape
        elif wape == best_wape and seg.startswith('D') and m_name == 'Croston':
            best_model = 'Croston'
            
    detailed_records.append({'Product': product, 'Segment': seg, 'Champion': best_model, 'WAPE': round(best_wape, 2)})

pd.DataFrame(detailed_records).to_csv("Ket_Qua_BD_He_So_Tu_Dong_Theo_Data.csv", index=False, encoding='utf-8-sig')
print("Hoàn tất xuất file!")
