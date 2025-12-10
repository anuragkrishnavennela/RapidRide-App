import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# Set random seed for reproducibility
random.seed(42)
np.random.seed(42)

def generate_sample_data(num_samples=1000):
    """
    Generate sample training data for ETA prediction.
    
    Args:
        num_samples: Number of samples to generate
    
    Returns:
        DataFrame with training data
    """
    data = []
    
    # Bangalore coordinates range (approximate)
    lat_min, lat_max = 12.85, 13.15
    lng_min, lng_max = 77.45, 77.75
    
    for _ in range(num_samples):
        # Generate random coordinates
        origin_lat = random.uniform(lat_min, lat_max)
        origin_lng = random.uniform(lng_min, lng_max)
        dest_lat = random.uniform(lat_min, lat_max)
        dest_lng = random.uniform(lng_min, lng_max)
        
        # Calculate distance (simplified)
        distance_km = np.sqrt((dest_lat - origin_lat)**2 + (dest_lng - origin_lng)**2) * 111  # rough km conversion
        distance_km = max(1.0, min(50.0, distance_km))  # Clamp to reasonable range
        
        # Generate time features
        hour = random.randint(0, 23)
        day_of_week = random.randint(0, 6)
        is_weekend = 1 if day_of_week >= 5 else 0
        is_rush_hour = 1 if (7 <= hour <= 10) or (17 <= hour <= 20) else 0
        
        # Generate traffic level
        base_traffic = 1.0
        if is_rush_hour:
            base_traffic = random.uniform(1.2, 2.0)
        elif is_weekend:
            base_traffic = random.uniform(0.8, 1.1)
        else:
            base_traffic = random.uniform(0.9, 1.3)
        
        # Calculate zone features (grid-based)
        origin_zone_lat = int(origin_lat / 0.1)
        origin_zone_lng = int(origin_lng / 0.1)
        dest_zone_lat = int(dest_lat / 0.1)
        dest_zone_lng = int(dest_lng / 0.1)
        
        # Calculate ETA (with some variation)
        # Base speed: 30 km/h
        avg_speed = 30.0 / base_traffic
        
        # Add some randomness
        speed_variation = random.uniform(0.8, 1.2)
        actual_speed = avg_speed * speed_variation
        
        # Calculate time in hours, then convert to seconds
        time_hours = distance_km / actual_speed
        eta_seconds = int(time_hours * 3600)
        
        # Add some noise
        noise = random.randint(-60, 60)  # ±1 minute noise
        eta_seconds = max(60, eta_seconds + noise)  # Minimum 1 minute
        
        # Create record
        record = {
            'distance_km': round(distance_km, 3),
            'traffic_level': round(base_traffic, 2),
            'hour': hour,
            'day_of_week': day_of_week,
            'is_weekend': is_weekend,
            'is_rush_hour': is_rush_hour,
            'origin_zone_lat': origin_zone_lat,
            'origin_zone_lng': origin_zone_lng,
            'dest_zone_lat': dest_zone_lat,
            'dest_zone_lng': dest_zone_lng,
            'eta_seconds': eta_seconds
        }
        
        data.append(record)
    
    return pd.DataFrame(data)


if __name__ == "__main__":
    print("Generating sample training data...")
    
    # Generate data
    df = generate_sample_data(num_samples=1000)
    
    # Create output directory
    output_dir = "data/processed"
    os.makedirs(output_dir, exist_ok=True)
    
    # Save to CSV
    output_path = os.path.join(output_dir, "training_data.csv")
    df.to_csv(output_path, index=False)
    
    print(f"Generated {len(df)} samples")
    print(f"Saved to: {output_path}")
    print("\nSample data:")
    print(df.head())
    print("\nData statistics:")
    print(df.describe())
