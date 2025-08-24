"""
Fallback coordinate provider for South Australian locations
"""
import logging
import random
import math
from typing import Tuple, Dict
from ..interfaces.geocoding import FallbackCoordinateProvider

logger = logging.getLogger(__name__)


class SAFallbackCoordinateProvider(FallbackCoordinateProvider):
    """South Australia specific fallback coordinate provider"""
    
    def __init__(self):
        """Initialize SA fallback coordinate provider"""
        # Fallback coordinates for major SA regions (approximate center points)
        self.region_coordinates = {
            # Major Cities - Adelaide Metropolitan Area
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
            'TEA TREE GULLY': (-34.8192, 138.7058),
            'SALISBURY': (-34.7677, 138.6422),
            'ONKAPARINGA': (-35.1333, 138.5167),
            'CHARLES STURT': (-34.9000, 138.5333),
            'WEST TORRENS': (-34.9500, 138.5667),
            
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
            'BERRI': (-34.2833, 140.6000),
            'GAWLER': (-34.6000, 138.7500),
            'BAROSSA': (-34.5000, 138.9000),
            'NARACOORTE': (-36.9667, 140.7333),
            
            # Smaller Towns
            'COOBER PEDY': (-29.0167, 134.7667),
            'ROXBY DOWNS': (-30.5667, 136.8833),
            'PORT PIRIE': (-33.1833, 138.0167),
            'WALLAROO': (-33.9333, 137.6333),
            'MOONTA': (-34.0667, 137.6000),
            'WUDINNA': (-33.0500, 135.4500),
            'STREAKY BAY': (-32.8000, 134.2000),
            'CEDUNA': (-32.1333, 133.6833),
            'KINGSCOTE': (-35.6500, 137.6500),
            'PENNESHAW': (-35.7167, 137.9500),
            
            # Default SA center for unknown suburbs
            'DEFAULT_SA': (-34.9285, 138.6007)
        }
        
        # SA geographic bounds for validation
        self.sa_bounds = {
            'min_lat': -38.0,
            'max_lat': -25.0,
            'min_lng': 129.0,
            'max_lng': 141.0
        }
    
    def get_fallback_coordinates(self, suburb: str, postcode: int) -> Tuple[float, float]:
        """
        Get fallback coordinates for a SA suburb
        
        Args:
            suburb: Suburb name
            postcode: Postcode
            
        Returns:
            Tuple of (latitude, longitude)
        """
        suburb_upper = suburb.upper().strip()
        
        # Strategy 1: Exact match in region coordinates
        if suburb_upper in self.region_coordinates:
            coords = self.region_coordinates[suburb_upper]
            # Add small random offset to avoid duplicate coordinates
            return self._add_random_offset(coords, max_offset_km=1.0)
        
        # Strategy 2: Partial match (e.g., "NORTH ADELAIDE" contains "ADELAIDE")
        for known_suburb, coords in self.region_coordinates.items():
            if known_suburb != 'DEFAULT_SA':  # Skip default
                if (known_suburb in suburb_upper or 
                    suburb_upper in known_suburb or 
                    self._is_similar_suburb_name(suburb_upper, known_suburb)):
                    
                    return self._add_random_offset(coords, max_offset_km=2.0)
        
        # Strategy 3: Use postcode-based estimation
        coords = self._estimate_coordinates_by_postcode(postcode)
        return self._add_random_offset(coords, max_offset_km=3.0)
    
    def _is_similar_suburb_name(self, suburb1: str, suburb2: str) -> bool:
        """Check if two suburb names are similar"""
        # Simple similarity check - could be enhanced with fuzzy matching
        words1 = set(suburb1.split())
        words2 = set(suburb2.split())
        
        # If they share at least one significant word (length > 2)
        common_words = words1.intersection(words2)
        significant_common = [w for w in common_words if len(w) > 2]
        
        return len(significant_common) > 0
    
    def _estimate_coordinates_by_postcode(self, postcode: int) -> Tuple[float, float]:
        """Estimate coordinates based on SA postcode patterns"""
        # SA postcode regions (approximate center points)
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
            return self.region_coordinates['DEFAULT_SA']
    
    def _add_random_offset(self, base_coords: Tuple[float, float], max_offset_km: float = 2.0) -> Tuple[float, float]:
        """Add random offset to coordinates to avoid duplicates"""
        base_lat, base_lng = base_coords
        
        # Convert offset to degrees (approximate)
        offset_deg = max_offset_km / 111.0  # 1 degree ≈ 111 km
        
        # Generate random point within circle
        angle = random.uniform(0, 2 * math.pi)
        distance = random.uniform(0, offset_deg)
        
        lat_offset = distance * math.cos(angle)
        lng_offset = distance * math.sin(angle) / math.cos(math.radians(base_lat))
        
        new_lat = base_lat + lat_offset
        new_lng = base_lng + lng_offset
        
        # Ensure coordinates are still within SA bounds
        if not self.is_location_valid(new_lat, new_lng):
            # If offset goes outside bounds, use smaller offset
            return self._add_random_offset(base_coords, max_offset_km * 0.5)
        
        return (new_lat, new_lng)
    
    def is_location_valid(self, lat: float, lng: float) -> bool:
        """
        Check if coordinates are within South Australia bounds
        
        Args:
            lat: Latitude
            lng: Longitude
            
        Returns:
            True if coordinates are within SA bounds
        """
        return (self.sa_bounds['min_lat'] <= lat <= self.sa_bounds['max_lat'] and
                self.sa_bounds['min_lng'] <= lng <= self.sa_bounds['max_lng'])
    
    def get_region_info(self) -> Dict[str, any]:
        """Get information about available regions"""
        return {
            'total_regions': len(self.region_coordinates) - 1,  # Exclude DEFAULT_SA
            'geographic_bounds': self.sa_bounds,
            'major_cities': [name for name in self.region_coordinates.keys() 
                           if name.endswith(('ADELAIDE', 'WHYALLA', 'PORT AUGUSTA', 'MOUNT GAMBIER'))],
            'postcode_ranges': {
                '5000-5199': 'Adelaide Metro',
                '5200-5299': 'Adelaide Hills', 
                '5300-5399': 'Barossa/Mid North',
                '5400-5499': 'Riverland',
                '5500-5599': 'Yorke Peninsula',
                '5600-5699': 'Whyalla/Iron Triangle',
                '5700-5799': 'Port Augusta/Far North',
                '5800-5899': 'West Coast',
                '5900+': 'Far West/Remote'
            }
        }
