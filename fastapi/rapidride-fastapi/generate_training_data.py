"""
Generate synthetic training data for ETA prediction model
Run this to create training data before training the model
"""

import pandas as pd
import numpy as np
from pathlib import Path

def generate_training_data(n_samples=10000, output_path='data/training_rides.csv'):
    """
    Generate synthetic ride data for training ML model
    
    Features:
    - distance_km: Ride distance
    - traffic_level: Traffic multiplier (0.8 = light, 1.0 = normal, 1.5 = heavy)
    - hour: Hour of day (0-23)
    - day_of_week: Day of week (0=Monday, 6=Sunday)
    - is_weekend: Binary flag
    - is_rush_hour: Binary flag (7-10am, 5-8pm)
    - origin_zone_lat/lng: Pickup location
    - dest_zone_lat/lng: Dropoff location
    - eta_seconds: Target variable (time in seconds)
    """
    
    print(f"🎲 Generating {n_samples} synthetic ride samples...")
    
    np.random.seed(42)
    
    # Bangalore coordinates (approximate bounds)
    LAT_MIN, LAT_MAX = 12.8, 13.2
    LNG_MIN, LNG_MAX = 77.4, 77.8
    
    # Generate base features
    data = {}
    
    # Distance: Most rides are short (1-10km), some longer
    data['distance_km'] = np.concatenate([
        np.random.gamma(2, 2, int(n_samples * 0.7)),  # 70% short rides
        np.random.uniform(10, 50, int(n_samples * 0.3))  # 30% long rides
    ])
    np.random.shuffle(data['distance_km'])
    
    # Traffic level: Normal=1.0, Rush=1.5-2.0, Light=0.8
    data['traffic_level'] = np.random.choice(
        [0.8, 1.0, 1.3, 1.5, 1.8, 2.0],
        n_samples,
        p=[0.15, 0.40, 0.20, 0.15, 0.08, 0.02]  # Weights
    )
    
    # Time features
    data['hour'] = np.random.randint(0, 24, n_samples)
    data['day_of_week'] = np.random.randint(0, 7, n_samples)
    data['is_weekend'] = (data['day_of_week'] >= 5).astype(int)
    
    # Rush hour: 7-10am or 5-8pm
    data['is_rush_hour'] = (
        ((data['hour'] >= 7) & (data['hour'] <= 10)) |
        ((data['hour'] >= 17) & (data['hour'] <= 20))
    ).astype(int)
    
    # Location zones (simplified grid)
    data['origin_zone_lat'] = np.random.uniform(LAT_MIN, LAT_MAX, n_samples)
    data['origin_zone_lng'] = np.random.uniform(LNG_MIN, LNG_MAX, n_samples)
    data['dest_zone_lat'] = np.random.uniform(LAT_MIN, LAT_MAX, n_samples)
    data['dest_zone_lng'] = np.random.uniform(LNG_MIN, LNG_MAX, n_samples)
    
    # Generate realistic ETA
    # Base speed: 30 km/h in normal traffic
    avg_speed = 30  # km/h
    
    # Adjust speed based on conditions
    speed_factor = np.ones(n_samples) * avg_speed
    
    # Rush hour reduces speed
    speed_factor[data['is_rush_hour'] == 1] *= 0.7
    
    # Weekend increases speed slightly
    speed_factor[data['is_weekend'] == 1] *= 1.1
    
    # Late night increases speed
    speed_factor[data['hour'] < 6] *= 1.3
    speed_factor[data['hour'] > 22] *= 1.2
    
    # Calculate base ETA
    time_hours = data['distance_km'] / speed_factor
    data['eta_seconds'] = (time_hours * 3600 * data['traffic_level']).astype(int)
    
    # Add realistic noise (±5 minutes)
    noise = np.random.normal(0, 300, n_samples)
    data['eta_seconds'] = (data['eta_seconds'] + noise).astype(int)
    
    # Ensure positive values
    data['eta_seconds'] = np.maximum(data['eta_seconds'], 60)  # Min 1 minute
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Create output directory if needed
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Save to CSV
    df.to_csv(output_path, index=False)
    
    print(f"✅ Saved {len(df)} samples to {output_path}")
    print(f"\n📊 Data Summary:")
    print(f"   Distance range: {df['distance_km'].min():.1f} - {df['distance_km'].max():.1f} km")
    print(f"   ETA range: {df['eta_seconds'].min()//60} - {df['eta_seconds'].max()//60} minutes")
    print(f"   Average ETA: {df['eta_seconds'].mean()//60:.0f} minutes")
    print(f"   Rush hour rides: {df['is_rush_hour'].sum()} ({df['is_rush_hour'].sum()/len(df)*100:.1f}%)")
    print(f"   Weekend rides: {df['is_weekend'].sum()} ({df['is_weekend'].sum()/len(df)*100:.1f}%)")
    
    return df


if __name__ == "__main__":
    # Generate training data
    df = generate_training_data(n_samples=10000)
    
    print("\n✅ Training data generated successfully!")
    print("📝 Next step: Train the model using:")
    print("   python -c \"from app.models.trainer import ETAModelTrainer; trainer = ETAModelTrainer(); trainer.train('data/training_rides.csv')\"")
