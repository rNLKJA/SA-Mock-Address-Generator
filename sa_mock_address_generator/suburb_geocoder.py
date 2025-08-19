"""
Suburb Geocoding System for SA Mock Address Generator
Provides valid geocoordinates for South Australian suburbs
"""
import googlemaps
import json
import os
import time
import logging
from typing import Dict, List, Optional, Tuple
import pandas as pd
from .config import GOOGLE_API_KEY, GOOGLE_MAPS_API_KEY

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SuburbGeocoder:
    """Geocode South Australian suburbs and cache results"""
    
    def __init__(self, api_key: str = None, cache_file: str = None):
        if cache_file is None:
            import os
            # Get the path to the cache file within the package
            package_dir = os.path.dirname(__file__)
            cache_file = os.path.join(package_dir, "data", "suburb_coordinates_cache.json")
        # Use GOOGLE_API_KEY as primary, fallback to GOOGLE_MAPS_API_KEY
        if api_key is None:
            api_key = GOOGLE_API_KEY or GOOGLE_MAPS_API_KEY
            
        self.api_key = api_key
        self.cache_file = cache_file
        self.coordinate_cache = {}
        self.client = None
        
        # Initialize Google Maps client if API key available
        if self.api_key:
            try:
                self.client = googlemaps.Client(key=self.api_key)
                logger.info("Google Maps client initialized for geocoding")
            except Exception as e:
                logger.warning(f"Failed to initialize Google Maps client: {e}")
                self.client = None
        else:
            logger.warning("No Google Maps API key available - using fallback coordinates")
        
        # Load cached coordinates
        self.load_cache()
        
        # Fallback coordinates for major SA regions (approximate center points)
        self.fallback_coordinates = {
            # Major Cities
            'ADELAIDE': (-34.9285, 138.6007),
            'NORTH ADELAIDE': (-34.9086, 138.5943),
            'GLENELG': (-34.9804, 138.5118),
            'PORT ADELAIDE': (-34.8475, 138.5057),
            'MARION': (-35.0189, 138.5431),
            'BURNSIDE': (-34.9436, 138.6394),
            'UNLEY': (-34.9495, 138.6060),
            'NORWOOD': (-34.9208, 138.6312),
            'PROSPECT': (-34.8850, 138.5950),
            'CAMPBELLTOWN': (-34.8847, 138.6775),
            
            # Regional Centers
            'WHYALLA': (-33.0333, 137.5833),
            'PORT AUGUSTA': (-32.4942, 137.7647),
            'PORT LINCOLN': (-34.7282, 135.8735),
            'MOUNT GAMBIER': (-37.8285, 140.7832),
            'MURRAY BRIDGE': (-35.1197, 139.2756),
            'VICTOR HARBOR': (-35.5522, 138.6219),
            'KADINA': (-33.9630, 137.7147),
            'CLARE': (-33.8319, 138.6089),
            'RENMARK': (-34.1761, 140.7475),
            'LOXTON': (-34.4483, 140.5703),
            
            # Default SA center for unknown suburbs
            'DEFAULT_SA': (-34.9285, 138.6007)
        }
    
    def load_cache(self) -> None:
        """Load cached coordinates from file"""
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r') as f:
                    self.coordinate_cache = json.load(f)
                logger.info(f"Loaded {len(self.coordinate_cache)} cached coordinates")
            except Exception as e:
                logger.warning(f"Failed to load coordinate cache: {e}")
                self.coordinate_cache = {}
    
    def save_cache(self) -> None:
        """Save coordinates to cache file"""
        try:
            with open(self.cache_file, 'w') as f:
                json.dump(self.coordinate_cache, f, indent=2)
            logger.info(f"Saved {len(self.coordinate_cache)} coordinates to cache")
        except Exception as e:
            logger.error(f"Failed to save coordinate cache: {e}")
    
    def get_suburb_coordinates(self, suburb: str, postcode: int, state: str = "SA") -> Tuple[float, float]:
        """
        Get coordinates for a suburb, using cache, Google Maps API, or fallback
        
        Args:
            suburb: Suburb name
            postcode: Postcode
            state: State abbreviation
            
        Returns:
            Tuple of (latitude, longitude)
        """
        # Create cache key
        cache_key = f"{suburb}_{postcode}_{state}".upper()
        
        # Check cache first
        if cache_key in self.coordinate_cache:
            coords = self.coordinate_cache[cache_key]
            return (coords['lat'], coords['lng'])
        
        # Try Google Maps API
        if self.client:
            try:
                coords = self._geocode_with_google(suburb, postcode, state)
                if coords:
                    # Cache the result
                    self.coordinate_cache[cache_key] = {
                        'lat': coords[0],
                        'lng': coords[1],
                        'source': 'google_maps'
                    }
                    return coords
            except Exception as e:
                logger.warning(f"Google Maps geocoding failed for {suburb}: {e}")
        
        # Use fallback coordinates
        coords = self._get_fallback_coordinates(suburb, postcode)
        self.coordinate_cache[cache_key] = {
            'lat': coords[0],
            'lng': coords[1],
            'source': 'fallback'
        }
        
        return coords
    
    def _geocode_with_google(self, suburb: str, postcode: int, state: str) -> Optional[Tuple[float, float]]:
        """Geocode using Google Maps API"""
        query = f"{suburb}, {postcode}, {state}, Australia"
        
        try:
            geocode_result = self.client.geocode(query)
            
            if geocode_result:
                location = geocode_result[0]['geometry']['location']
                lat, lng = location['lat'], location['lng']
                
                # Verify it's in South Australia (rough bounds check)
                if self._is_in_south_australia(lat, lng):
                    logger.debug(f"Geocoded {suburb} to ({lat:.4f}, {lng:.4f})")
                    return (lat, lng)
                else:
                    logger.warning(f"Geocoded location for {suburb} appears to be outside SA")
                    
        except Exception as e:
            logger.debug(f"Geocoding error for {suburb}: {e}")
        
        return None
    
    def _is_in_south_australia(self, lat: float, lng: float) -> bool:
        """Check if coordinates are roughly within South Australia bounds"""
        # Approximate SA bounds
        SA_BOUNDS = {
            'min_lat': -38.0,
            'max_lat': -25.0,
            'min_lng': 129.0,
            'max_lng': 141.0
        }
        
        return (SA_BOUNDS['min_lat'] <= lat <= SA_BOUNDS['max_lat'] and
                SA_BOUNDS['min_lng'] <= lng <= SA_BOUNDS['max_lng'])
    
    def _get_fallback_coordinates(self, suburb: str, postcode: int) -> Tuple[float, float]:
        """Get fallback coordinates based on suburb name or postcode"""
        suburb_upper = suburb.upper()
        
        # Check exact match in fallback coordinates
        if suburb_upper in self.fallback_coordinates:
            return self.fallback_coordinates[suburb_upper]
        
        # Check for partial matches (e.g., "NORTH ADELAIDE" contains "ADELAIDE")
        for known_suburb, coords in self.fallback_coordinates.items():
            if known_suburb in suburb_upper or suburb_upper in known_suburb:
                # Add small random offset to avoid duplicate coordinates
                import random
                lat_offset = random.uniform(-0.01, 0.01)
                lng_offset = random.uniform(-0.01, 0.01)
                return (coords[0] + lat_offset, coords[1] + lng_offset)
        
        # Use postcode-based approximation
        coords = self._estimate_coordinates_by_postcode(postcode)
        
        # Add random offset for variety
        import random
        lat_offset = random.uniform(-0.02, 0.02)
        lng_offset = random.uniform(-0.02, 0.02)
        
        return (coords[0] + lat_offset, coords[1] + lng_offset)
    
    def _estimate_coordinates_by_postcode(self, postcode: int) -> Tuple[float, float]:
        """Estimate coordinates based on SA postcode patterns"""
        # SA postcode regions (approximate)
        if 5000 <= postcode <= 5199:  # Adelaide metro
            return (-34.9285, 138.6007)
        elif 5200 <= postcode <= 5299:  # Adelaide Hills
            return (-34.9800, 138.7500)
        elif 5300 <= postcode <= 5399:  # Barossa/Mid North
            return (-34.5000, 138.8000)
        elif 5400 <= postcode <= 5499:  # Riverland
            return (-34.1761, 140.7475)
        elif 5500 <= postcode <= 5599:  # Yorke Peninsula
            return (-34.0000, 137.5000)
        elif 5600 <= postcode <= 5699:  # Whyalla/Iron Triangle
            return (-33.0333, 137.5833)
        elif 5700 <= postcode <= 5799:  # Port Augusta/Far North
            return (-32.4942, 137.7647)
        elif 5800 <= postcode <= 5899:  # West Coast
            return (-34.7282, 135.8735)
        elif postcode >= 5900:  # Far West/Remote
            return (-32.0000, 135.0000)
        else:
            # Default to Adelaide
            return self.fallback_coordinates['DEFAULT_SA']
    
    def batch_geocode_suburbs(self, suburbs_df: pd.DataFrame) -> pd.DataFrame:
        """
        Batch geocode suburbs from a DataFrame
        
        Args:
            suburbs_df: DataFrame with 'Suburb' and 'Postcode' columns
            
        Returns:
            DataFrame with added 'latitude' and 'longitude' columns
        """
        logger.info(f"Batch geocoding {len(suburbs_df)} suburbs...")
        
        result_df = suburbs_df.copy()
        latitudes = []
        longitudes = []
        
        for _, row in suburbs_df.iterrows():
            suburb = row['Suburb']
            postcode = int(row['Postcode'])
            
            try:
                lat, lng = self.get_suburb_coordinates(suburb, postcode)
                latitudes.append(lat)
                longitudes.append(lng)
                
                # Rate limiting for Google Maps API
                if self.client:
                    time.sleep(0.1)  # 10 requests per second max
                    
            except Exception as e:
                logger.error(f"Failed to geocode {suburb} {postcode}: {e}")
                # Use default coordinates
                default_coords = self.fallback_coordinates['DEFAULT_SA']
                latitudes.append(default_coords[0])
                longitudes.append(default_coords[1])
        
        result_df['latitude'] = latitudes
        result_df['longitude'] = longitudes
        
        # Save cache after batch processing
        self.save_cache()
        
        logger.info(f"Completed batch geocoding. Cache now has {len(self.coordinate_cache)} entries")
        return result_df
    
    def generate_random_nearby_coordinates(self, base_lat: float, base_lng: float, 
                                         radius_km: float = 2.0) -> Tuple[float, float]:
        """
        Generate random coordinates near a base location
        
        Args:
            base_lat: Base latitude
            base_lng: Base longitude  
            radius_km: Radius in kilometers
            
        Returns:
            Tuple of (latitude, longitude) within the radius
        """
        import random
        import math
        
        # Convert radius to degrees (approximate)
        radius_deg = radius_km / 111.0  # 1 degree ≈ 111 km
        
        # Generate random point within circle
        angle = random.uniform(0, 2 * math.pi)
        distance = random.uniform(0, radius_deg)
        
        lat_offset = distance * math.cos(angle)
        lng_offset = distance * math.sin(angle) / math.cos(math.radians(base_lat))
        
        new_lat = base_lat + lat_offset
        new_lng = base_lng + lng_offset
        
        return (new_lat, new_lng)



