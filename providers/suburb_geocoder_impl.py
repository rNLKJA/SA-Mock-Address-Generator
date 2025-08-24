"""
Implementation of SuburbGeocoder using dependency injection and SOLID principles
"""
import logging
import time
import math
import random
from typing import Tuple, Optional, List
import pandas as pd

from ..interfaces.geocoding import (
    SuburbGeocoder, 
    GeocodingProvider, 
    CoordinateCache, 
    FallbackCoordinateProvider
)

logger = logging.getLogger(__name__)


class SuburbGeocoderImpl(SuburbGeocoder):
    """
    Implementation of SuburbGeocoder following Dependency Inversion Principle
    
    Uses injected dependencies for geocoding provider, cache, and fallback coordinates
    """
    
    def __init__(self, 
                 geocoding_provider: Optional[GeocodingProvider] = None,
                 coordinate_cache: Optional[CoordinateCache] = None,
                 fallback_provider: Optional[FallbackCoordinateProvider] = None):
        """
        Initialize suburb geocoder with injected dependencies
        
        Args:
            geocoding_provider: Primary geocoding service (e.g., Mapbox)
            coordinate_cache: Coordinate caching implementation
            fallback_provider: Fallback coordinate provider
        """
        self.geocoding_provider = geocoding_provider
        self.coordinate_cache = coordinate_cache
        self.fallback_provider = fallback_provider
        
        # Track geocoding stats
        self.stats = {
            'cache_hits': 0,
            'api_calls': 0,
            'fallback_used': 0,
            'errors': 0
        }
    
    def get_suburb_coordinates(self, suburb: str, postcode: int, state: str = "SA") -> Tuple[float, float]:
        """
        Get coordinates for a suburb using cache, API, and fallback in order
        
        Args:
            suburb: Suburb name
            postcode: Postcode
            state: State abbreviation (default: "SA")
            
        Returns:
            Tuple of (latitude, longitude)
        """
        if not suburb or not postcode:
            raise ValueError("Both suburb and postcode are required")
        
        # Create cache key
        cache_key = f"{suburb}_{postcode}_{state}".upper()
        
        # Strategy 1: Check cache first
        if self.coordinate_cache:
            cached_coords = self.coordinate_cache.get_coordinates(cache_key)
            if cached_coords:
                self.stats['cache_hits'] += 1
                logger.debug(f"Cache hit for {suburb}")
                return cached_coords
        
        # Strategy 2: Try primary geocoding provider
        if self.geocoding_provider and self.geocoding_provider.is_available():
            try:
                address = f"{suburb}, {state} {postcode}, Australia"
                components = {'country': 'AU'}
                
                coords = self.geocoding_provider.geocode_address(address, components)
                if coords:
                    self.stats['api_calls'] += 1
                    
                    # Cache the result
                    if self.coordinate_cache:
                        provider_name = type(self.geocoding_provider).__name__
                        self.coordinate_cache.set_coordinates(
                            cache_key, coords[0], coords[1], 
                            source=provider_name.lower()
                        )
                    
                    logger.debug(f"Geocoded {suburb} via {type(self.geocoding_provider).__name__}")
                    return coords
                    
            except Exception as e:
                logger.warning(f"Geocoding failed for {suburb}: {e}")
                self.stats['errors'] += 1
        
        # Strategy 3: Use fallback coordinates
        if self.fallback_provider:
            try:
                coords = self.fallback_provider.get_fallback_coordinates(suburb, postcode)
                self.stats['fallback_used'] += 1
                
                # Cache fallback result
                if self.coordinate_cache:
                    self.coordinate_cache.set_coordinates(
                        cache_key, coords[0], coords[1], 
                        source='fallback'
                    )
                
                logger.debug(f"Using fallback coordinates for {suburb}")
                return coords
                
            except Exception as e:
                logger.error(f"Fallback coordinates failed for {suburb}: {e}")
                self.stats['errors'] += 1
        
        # Last resort: Use default SA coordinates
        logger.warning(f"No coordinates found for {suburb}, using default SA location")
        default_coords = (-34.9285, 138.6007)  # Adelaide
        
        if self.coordinate_cache:
            self.coordinate_cache.set_coordinates(
                cache_key, default_coords[0], default_coords[1], 
                source='default'
            )
        
        return default_coords
    
    def batch_geocode_suburbs(self, suburbs_df: pd.DataFrame) -> pd.DataFrame:
        """
        Batch geocode multiple suburbs with rate limiting and progress tracking
        
        Args:
            suburbs_df: DataFrame with 'Suburb' and 'Postcode' columns
            
        Returns:
            DataFrame with added 'latitude' and 'longitude' columns
        """
        if suburbs_df.empty:
            return suburbs_df
        
        required_columns = ['Suburb', 'Postcode']
        missing_columns = [col for col in required_columns if col not in suburbs_df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")
        
        logger.info(f"Batch geocoding {len(suburbs_df)} suburbs...")
        
        result_df = suburbs_df.copy()
        latitudes = []
        longitudes = []
        
        total_suburbs = len(suburbs_df)
        processed = 0
        
        for _, row in suburbs_df.iterrows():
            suburb = str(row['Suburb']).strip()
            postcode = int(row['Postcode'])
            
            try:
                lat, lng = self.get_suburb_coordinates(suburb, postcode)
                latitudes.append(lat)
                longitudes.append(lng)
                
                processed += 1
                
                # Progress logging every 100 items
                if processed % 100 == 0:
                    logger.info(f"Processed {processed}/{total_suburbs} suburbs")
                
                # Rate limiting for API calls
                if (self.geocoding_provider and 
                    self.geocoding_provider.is_available() and 
                    self.stats['api_calls'] > 0):
                    time.sleep(0.1)  # Respect rate limits
                    
            except Exception as e:
                logger.error(f"Failed to geocode {suburb} {postcode}: {e}")
                # Use default coordinates on error
                latitudes.append(-34.9285)
                longitudes.append(138.6007)
        
        result_df['latitude'] = latitudes
        result_df['longitude'] = longitudes
        
        # Save cache after batch processing
        if self.coordinate_cache:
            self.coordinate_cache.save_cache()
        
        logger.info(f"Completed batch geocoding. Stats: {self.get_geocoding_stats()}")
        return result_df
    
    def generate_random_nearby_coordinates(self, 
                                         base_lat: float, 
                                         base_lng: float, 
                                         radius_km: float = 2.0) -> Tuple[float, float]:
        """
        Generate random coordinates near a base location
        
        Args:
            base_lat: Base latitude
            base_lng: Base longitude
            radius_km: Radius in kilometers (default: 2.0)
            
        Returns:
            Tuple of (latitude, longitude) within the radius
        """
        if radius_km <= 0:
            return (base_lat, base_lng)
        
        # Convert radius to degrees (approximate)
        radius_deg = radius_km / 111.0  # 1 degree ≈ 111 km
        
        # Generate random point within circle using polar coordinates
        angle = random.uniform(0, 2 * math.pi)
        # Use square root for uniform distribution within circle
        distance = radius_deg * math.sqrt(random.uniform(0, 1))
        
        lat_offset = distance * math.cos(angle)
        lng_offset = distance * math.sin(angle) / math.cos(math.radians(base_lat))
        
        new_lat = base_lat + lat_offset
        new_lng = base_lng + lng_offset
        
        # Validate coordinates if fallback provider is available
        if self.fallback_provider:
            if not self.fallback_provider.is_location_valid(new_lat, new_lng):
                # If outside valid bounds, use smaller radius
                return self.generate_random_nearby_coordinates(
                    base_lat, base_lng, radius_km * 0.5
                )
        
        return (new_lat, new_lng)
    
    def get_geocoding_stats(self) -> dict:
        """Get statistics about geocoding operations"""
        total_requests = sum(self.stats.values())
        
        if total_requests == 0:
            return self.stats.copy()
        
        stats_with_percentages = self.stats.copy()
        stats_with_percentages.update({
            'cache_hit_rate': (self.stats['cache_hits'] / total_requests) * 100,
            'api_success_rate': (self.stats['api_calls'] / total_requests) * 100,
            'fallback_rate': (self.stats['fallback_used'] / total_requests) * 100,
            'error_rate': (self.stats['errors'] / total_requests) * 100,
            'total_requests': total_requests
        })
        
        return stats_with_percentages
    
    def reset_stats(self) -> None:
        """Reset geocoding statistics"""
        self.stats = {
            'cache_hits': 0,
            'api_calls': 0,
            'fallback_used': 0,
            'errors': 0
        }
    
    def save_cache(self) -> None:
        """Save coordinate cache to persistent storage"""
        if self.coordinate_cache:
            self.coordinate_cache.save_cache()
    
    def get_cache_info(self) -> dict:
        """Get information about the coordinate cache"""
        if self.coordinate_cache and hasattr(self.coordinate_cache, 'get_cache_stats'):
            return self.coordinate_cache.get_cache_stats()
        return {'cache_available': False}
