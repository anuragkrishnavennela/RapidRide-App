# Data Directory

## Structure

- `raw/`: Raw, unprocessed ride data
- `processed/`: Cleaned and processed data ready for model training

## Sample Data Generation

Generate sample training data:

```powershell
python data/generate_sample_data.py
```

This creates `processed/training_data.csv` with 1000 sample records.

## Data Schema

### Training Data (processed/training_data.csv)

| Column | Type | Description |
|--------|------|-------------|
| distance_km | float | Trip distance in kilometers |
| traffic_level | float | Traffic multiplier (1.0 = normal) |
| hour | int | Hour of day (0-23) |
| day_of_week | int | Day of week (0=Monday, 6=Sunday) |
| is_weekend | int | Weekend indicator (0 or 1) |
| is_rush_hour | int | Rush hour indicator (0 or 1) |
| origin_zone_lat | int | Origin zone latitude grid |
| origin_zone_lng | int | Origin zone longitude grid |
| dest_zone_lat | int | Destination zone latitude grid |
| dest_zone_lng | int | Destination zone longitude grid |
| eta_seconds | int | Actual ETA in seconds (target variable) |

### Optional Columns

- `historical_mean_eta`: Historical average ETA for similar routes (float)
- `ride_id`: Unique ride identifier (string)
- `user_id`: User identifier (string)
- `timestamp`: ISO-8601 timestamp (string)

## Training the Model

After generating data:

```powershell
python -c "from app.models.trainer import train_model; train_model('data/processed/training_data.csv')"
```

Or use the Celery task for async training:

```python
from app.tasks.tasks import train_model_task
task = train_model_task.delay("data/processed/training_data.csv")
```

## Data Preprocessing

For custom raw data, implement preprocessing in `preprocess.py`:

1. Load raw ride data
2. Calculate distance using Haversine formula
3. Extract time features from timestamps
4. Compute zone features
5. Clean and validate data
6. Save to `processed/` directory
