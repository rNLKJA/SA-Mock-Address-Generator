"""
Coordinate caching implementation
"""
import json
import os
import logging
from typing import Tuple, Optional, Dict, Any
from ..interfaces.geocoding import CoordinateCache

logger = logging.getLogger(__name__)


class JsonCoordinateCache(CoordinateCache):
    """JSON file-based coordinate cache implementation"""
    
    def __init__(self, cache_file: str = None):
        """
        Initialize JSON coordinate cache
        
        Args:
            cache_file: Path to cache file. If None, uses default location.
        """
        if cache_file is None:
            # Default to data directory in package
            package_dir = os.path.dirname(os.path.dirname(__file__))
            cache_file = os.path.join(package_dir, "data", "suburb_coordinates_cache.json")
        
        self.cache_file = cache_file
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.load_cache()
    
    def get_coordinates(self, cache_key: str) -> Optional[Tuple[float, float]]:
        """
        Get coordinates from cache
        
        Args:
            cache_key: Key to lookup in cache
            
        Returns:
            Tuple of (latitude, longitude) or None if not found
        """
        cache_key = cache_key.upper()  # Normalize case
        
        if cache_key in self.cache:
            coords = self.cache[cache_key]
            return (coords['lat'], coords['lng'])
        
        return None
    
    def set_coordinates(self, cache_key: str, lat: float, lng: float, source: str = None) -> None:
        """
        Save coordinates to cache
        
        Args:
            cache_key: Key to store in cache
            lat: Latitude
            lng: Longitude
            source: Source of the coordinates (e.g., 'mapbox', 'fallback')
        """
        cache_key = cache_key.upper()  # Normalize case
        
        self.cache[cache_key] = {
            'lat': lat,
            'lng': lng,
            'source': source or 'unknown',
            'timestamp': self._get_current_timestamp()
        }
    
    def load_cache(self) -> None:
        """Load cache from JSON file"""
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    self.cache = json.load(f)
                logger.info(f"Loaded {len(self.cache)} cached coordinates from {self.cache_file}")
            else:
                logger.info(f"Cache file {self.cache_file} not found, starting with empty cache")
                # Create directory if it doesn't exist
                os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
                
        except Exception as e:
            logger.warning(f"Failed to load coordinate cache: {e}")
            self.cache = {}
    
    def save_cache(self) -> None:
        """Save cache to JSON file"""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, indent=2, ensure_ascii=False)
            
            logger.debug(f"Saved {len(self.cache)} coordinates to cache")
            
        except Exception as e:
            logger.error(f"Failed to save coordinate cache: {e}")
    
    def _get_current_timestamp(self) -> str:
        """Get current timestamp string"""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        if not self.cache:
            return {'total_entries': 0, 'sources': {}}
        
        source_counts = {}
        for entry in self.cache.values():
            source = entry.get('source', 'unknown')
            source_counts[source] = source_counts.get(source, 0) + 1
        
        return {
            'total_entries': len(self.cache),
            'sources': source_counts,
            'cache_file': self.cache_file
        }
    
    def clear_cache(self) -> None:
        """Clear all cached coordinates"""
        self.cache = {}
        try:
            if os.path.exists(self.cache_file):
                os.remove(self.cache_file)
            logger.info("Cache cleared")
        except Exception as e:
            logger.error(f"Failed to clear cache file: {e}")
    
    def remove_entry(self, cache_key: str) -> bool:
        """
        Remove a specific entry from cache
        
        Args:
            cache_key: Key to remove
            
        Returns:
            True if entry was removed, False if not found
        """
        cache_key = cache_key.upper()
        
        if cache_key in self.cache:
            del self.cache[cache_key]
            return True
        
        return False
