"""
Geocoding interfaces following Interface Segregation Principle
"""
from abc import ABC, abstractmethod
from typing import Tuple, Optional, Dict, List
import pandas as pd


class GeocodingProvider(ABC):
    """Abstract interface for geocoding providers"""
    
    @abstractmethod
    def geocode_address(self, address: str, components: Optional[Dict[str, str]] = None) -> Optional[Tuple[float, float]]:
        """
        Geocode a single address
        
        Args:
            address: Address string to geocode
            components: Optional component filters (country, state, etc.)
            
        Returns:
            Tuple of (latitude, longitude) or None if not found
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if the geocoding service is available"""
        pass


class CoordinateCache(ABC):
    """Abstract interface for coordinate caching"""
    
    @abstractmethod
    def get_coordinates(self, cache_key: str) -> Optional[Tuple[float, float]]:
        """Get coordinates from cache"""
        pass
    
    @abstractmethod
    def set_coordinates(self, cache_key: str, lat: float, lng: float, source: str = None) -> None:
        """Save coordinates to cache"""
        pass
    
    @abstractmethod
    def load_cache(self) -> None:
        """Load cache from persistent storage"""
        pass
    
    @abstractmethod
    def save_cache(self) -> None:
        """Save cache to persistent storage"""
        pass


class FallbackCoordinateProvider(ABC):
    """Abstract interface for fallback coordinate providers"""
    
    @abstractmethod
    def get_fallback_coordinates(self, suburb: str, postcode: int) -> Tuple[float, float]:
        """Get fallback coordinates for a suburb"""
        pass
    
    @abstractmethod
    def is_location_valid(self, lat: float, lng: float) -> bool:
        """Check if coordinates are within expected geographic bounds"""
        pass


class SuburbGeocoder(ABC):
    """Main geocoding interface combining all geocoding capabilities"""
    
    @abstractmethod
    def get_suburb_coordinates(self, suburb: str, postcode: int, state: str = "SA") -> Tuple[float, float]:
        """Get coordinates for a suburb with caching and fallback"""
        pass
    
    @abstractmethod
    def batch_geocode_suburbs(self, suburbs_df: pd.DataFrame) -> pd.DataFrame:
        """Batch geocode multiple suburbs"""
        pass
    
    @abstractmethod
    def generate_random_nearby_coordinates(self, base_lat: float, base_lng: float, radius_km: float = 2.0) -> Tuple[float, float]:
        """Generate random coordinates near a base location"""
        pass
