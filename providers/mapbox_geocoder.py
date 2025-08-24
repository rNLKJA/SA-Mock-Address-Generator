"""
Mapbox geocoding provider implementation
"""
import requests
import logging
from typing import Tuple, Optional, Dict
from ..interfaces.geocoding import GeocodingProvider

logger = logging.getLogger(__name__)


class MapboxGeocodingProvider(GeocodingProvider):
    """Mapbox implementation of geocoding provider"""
    
    def __init__(self, api_key: str):
        """
        Initialize Mapbox geocoding provider
        
        Args:
            api_key: Mapbox API access token
        """
        self.api_key = api_key
        self.base_url = "https://api.mapbox.com/geocoding/v5/mapbox.places"
        self._validate_api_key()
    
    def _validate_api_key(self) -> None:
        """Validate the API key format"""
        if not self.api_key:
            raise ValueError("Mapbox API key is required")
        
        if not self.api_key.startswith(('pk.', 'sk.')):
            logger.warning("Mapbox API key should start with 'pk.' (public) or 'sk.' (secret)")
    
    def geocode_address(self, address: str, components: Optional[Dict[str, str]] = None) -> Optional[Tuple[float, float]]:
        """
        Geocode a single address using Mapbox Geocoding API
        
        Args:
            address: Address string to geocode
            components: Optional component filters (country, state, etc.)
            
        Returns:
            Tuple of (latitude, longitude) or None if not found
        """
        if not address or not address.strip():
            return None
            
        try:
            # Build query parameters
            params = {
                'access_token': self.api_key,
                'limit': 1,  # Only need the best match
                'types': 'place,locality,neighborhood,address'  # Focus on relevant place types
            }
            
            # Add component filters if provided
            if components:
                if 'country' in components:
                    params['country'] = components['country']
                    
                # For Australia, we can add proximity to improve results
                if components.get('country') == 'AU':
                    params['proximity'] = '138.6007,-34.9285'  # Adelaide coordinates
            
            # URL encode the address
            encoded_address = requests.utils.quote(address)
            url = f"{self.base_url}/{encoded_address}.json"
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('features'):
                feature = data['features'][0]
                coordinates = feature['geometry']['coordinates']
                # Mapbox returns [longitude, latitude], we need [latitude, longitude]
                longitude, latitude = coordinates
                
                # Validate coordinates are reasonable for Australia
                if self._is_valid_australian_coordinates(latitude, longitude):
                    logger.debug(f"Geocoded '{address}' to ({latitude:.4f}, {longitude:.4f})")
                    return (latitude, longitude)
                else:
                    logger.warning(f"Geocoded coordinates for '{address}' appear to be outside Australia")
                    
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Mapbox API request failed for '{address}': {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error geocoding '{address}': {e}")
            return None
    
    def _is_valid_australian_coordinates(self, lat: float, lng: float) -> bool:
        """Check if coordinates are within Australian bounds"""
        # Australian continental bounds (approximate)
        AUSTRALIA_BOUNDS = {
            'min_lat': -44.0,  # Tasmania
            'max_lat': -10.0,  # Northern Territory
            'min_lng': 113.0,  # Western Australia
            'max_lng': 154.0   # Queensland/NSW
        }
        
        return (AUSTRALIA_BOUNDS['min_lat'] <= lat <= AUSTRALIA_BOUNDS['max_lat'] and
                AUSTRALIA_BOUNDS['min_lng'] <= lng <= AUSTRALIA_BOUNDS['max_lng'])
    
    def is_available(self) -> bool:
        """
        Check if the Mapbox geocoding service is available
        
        Returns:
            True if service is available, False otherwise
        """
        if not self.api_key:
            return False
            
        try:
            # Test with a simple geocoding request
            test_address = "Sydney, Australia"
            params = {
                'access_token': self.api_key,
                'limit': 1
            }
            
            encoded_address = requests.utils.quote(test_address)
            url = f"{self.base_url}/{encoded_address}.json"
            
            response = requests.get(url, params=params, timeout=5)
            return response.status_code == 200
            
        except Exception as e:
            logger.debug(f"Mapbox availability check failed: {e}")
            return False
    
    def get_rate_limit_info(self) -> Dict[str, any]:
        """
        Get current rate limit information
        
        Returns:
            Dictionary with rate limit information
        """
        # Mapbox has different rate limits based on plan
        # This is a basic implementation - in production you'd track actual usage
        return {
            'provider': 'Mapbox',
            'requests_per_month': 100000,  # Free tier limit
            'requests_per_minute': 600,    # Rate limit
            'current_usage': 'Unknown'     # Would need to track separately
        }
