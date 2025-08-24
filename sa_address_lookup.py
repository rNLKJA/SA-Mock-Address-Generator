"""
SA Address Lookup - Simple address lookup and generation for South Australia
"""
import os
import random
import csv
from typing import Dict, List, Optional, Union, Any, cast
import requests
import pandas as pd
from config import MAPBOX_API_KEY, MAX_VALIDATION_RETRIES, DEFAULT_REMOTENESS_WEIGHTS, DEFAULT_SOCIOECONOMIC_WEIGHTS


class SAAddressLookup:
    """
    Simple South Australian address lookup and generation using Mapbox API
    """
    
    def __init__(self, mapbox_api_key: Optional[str] = None, data_file: str = "data/sa_suburbs_data.csv"):
        """
        Initialize the SA Address Lookup with Mapbox API key and suburb data
        
        Args:
            mapbox_api_key: Mapbox API key for geocoding (optional, defaults to config)
            data_file: Path to SA suburbs data CSV file
        """
        self.mapbox_api_key = mapbox_api_key or MAPBOX_API_KEY
        self.data_file = data_file
        self.suburbs_data = self._load_suburbs_data()
        
        if not self.mapbox_api_key:
            print("Warning: No Mapbox API key provided. Address lookup functionality will be limited.")
    
    def _load_suburbs_data(self) -> pd.DataFrame:
        """
        Load suburbs data from CSV file
        
        Returns:
            DataFrame with suburb information
        """
        try:
            df = pd.read_csv(self.data_file)
            # Remove empty rows
            df = df.dropna(subset=['Suburb'])
            return df
        except FileNotFoundError:
            print(f"Warning: Could not find data file {self.data_file}")
            return pd.DataFrame()
    
    def lookup_address(self, address: str) -> Optional[Dict[str, Any]]:
        """
        Look up an address and return suburb and council information
        
        Args:
            address: Street address to look up
            
        Returns:
            Dictionary with address details or None if address not in SA
        """
        if not self.mapbox_api_key:
            print("No Mapbox API key available for address lookup")
            return None
        
        # Use Mapbox Geocoding API with retries
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{address}.json"
        params = {
            'access_token': self.mapbox_api_key,
            'country': 'AU',
            'region': 'SA',
            'limit': 1
        }
        
        for attempt in range(MAX_VALIDATION_RETRIES):
            try:
                response = requests.get(url, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()
                
                if not data.get('features'):
                    return None
                
                feature = data['features'][0]
                place_name = feature.get('place_name', '')
                coordinates = feature.get('center', [])
                
                # Check if address is in South Australia
                if 'SA' not in place_name and 'South Australia' not in place_name:
                    return None
                
                # Extract suburb from the geocoded result
                suburb = self._extract_suburb_from_geocode(feature)
                if not suburb:
                    return None
                
                # Find suburb details in our data
                suburb_info = self._find_suburb_info(suburb)
                if suburb_info is None:
                    return None
                
                # Extract street address from the place name
                street_address = self._extract_street_address(place_name)
                
                return {
                    'street_address': street_address,
                    'full_address': place_name,
                    'suburb': suburb_info['Suburb'],
                    'postcode': suburb_info['Postcode'], 
                    'council': suburb_info['Council'],
                    'latitude': coordinates[1] if len(coordinates) > 1 else None,
                    'longitude': coordinates[0] if len(coordinates) > 0 else None,
                    'socio_economic_status': suburb_info['SocioEconomicStatus'],
                    'remoteness_level': suburb_info['Remoteness Level']
                }
                
            except requests.RequestException as e:
                print(f"Attempt {attempt + 1} failed: {e}")
                if attempt == MAX_VALIDATION_RETRIES - 1:
                    print(f"Failed to lookup address after {MAX_VALIDATION_RETRIES} attempts")
                    return None
        
        return None
    
    def _extract_street_address(self, place_name: str) -> str:
        """
        Extract street address from full place name
        
        Args:
            place_name: Full place name from geocoding
            
        Returns:
            Street address portion
        """
        # Split by comma and take the first part as street address
        parts = place_name.split(',')
        return parts[0].strip() if parts else place_name
    
    def _extract_suburb_from_geocode(self, feature: Dict) -> Optional[str]:
        """
        Extract suburb name from Mapbox geocoding result
        
        Args:
            feature: Mapbox geocoding feature
            
        Returns:
            Suburb name or None
        """
        # Try to find suburb in the context
        context = feature.get('context', [])
        for item in context:
            if item.get('id', '').startswith('place'):
                return item.get('text', '').upper()
        
        # Fallback to parsing the place name
        place_name = feature.get('place_name', '')
        parts = place_name.split(',')
        if len(parts) >= 2:
            return parts[1].strip().upper()
        
        return None
    
    def _find_suburb_info(self, suburb_name: str) -> Optional[Dict[str, Any]]:
        """
        Find suburb information in the data
        
        Args:
            suburb_name: Name of the suburb
            
        Returns:
            Suburb information or None
        """
        if self.suburbs_data.empty:
            return None
        
        suburb_upper = suburb_name.upper()
        match = self.suburbs_data[self.suburbs_data['Suburb'].str.upper() == suburb_upper]
        
        if not match.empty:
            return match.iloc[0].to_dict()
        
        return None
    
    def generate_random_address(self, 
                              distribution_type: str = 'default',
                              distribution_value: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a random valid South Australian address
        
        Args:
            distribution_type: Type of distribution ('default', 'suburb', 'council', 'remoteness', 'socioeconomic')
            distribution_value: Specific value to filter by (when not using default)
            
        Returns:
            Dictionary with generated address details
        """
        if self.suburbs_data.empty:
            raise ValueError("No suburb data available for address generation")
        
        # Filter suburbs based on distribution type
        filtered_suburbs = self._filter_suburbs_by_distribution(distribution_type, distribution_value)
        
        if filtered_suburbs.empty:
            # Fallback to all suburbs if filter returns empty
            filtered_suburbs = self.suburbs_data
        
        # Select random suburb
        suburb_info = filtered_suburbs.sample(n=1).iloc[0]
        
        # Generate random street details
        street_number = random.randint(1, 999)
        street_name = self._generate_street_name()
        street_address = f"{street_number} {street_name}"
        
        # Build full address
        full_address = f"{street_address}, {suburb_info['Suburb']} SA {suburb_info['Postcode']}"
        
        # Get approximate coordinates for the suburb (from geocoding if API available)
        latitude, longitude = self._get_suburb_coordinates(suburb_info['Suburb'])
        
        return {
            'street_address': street_address,
            'street_number': street_number,
            'street_name': street_name,
            'suburb': suburb_info['Suburb'],
            'postcode': suburb_info['Postcode'],
            'full_address': full_address,
            'council': suburb_info['Council'],
            'latitude': latitude,
            'longitude': longitude,
            'socio_economic_status': suburb_info['SocioEconomicStatus'],
            'remoteness_level': suburb_info['Remoteness Level']
        }
    
    def _filter_suburbs_by_distribution(self, 
                                       distribution_type: str, 
                                       distribution_value: Optional[str]) -> pd.DataFrame:
        """
        Filter suburbs based on distribution parameters
        
        Args:
            distribution_type: Type of distribution filter
            distribution_value: Value to filter by
            
        Returns:
            Filtered DataFrame
        """
        if distribution_type == 'default':
            return self.suburbs_data
        
        if distribution_value is None:
            return self.suburbs_data
        
        if distribution_type == 'suburb':
            filtered = self.suburbs_data[
                self.suburbs_data['Suburb'].str.upper() == distribution_value.upper()
            ]
            return cast(pd.DataFrame, filtered.copy())
        elif distribution_type == 'council':
            filtered = self.suburbs_data[
                self.suburbs_data['Council'].str.upper() == distribution_value.upper()
            ]
            return cast(pd.DataFrame, filtered.copy())
        elif distribution_type == 'remoteness':
            filtered = self.suburbs_data[
                self.suburbs_data['Remoteness Level'].str.upper() == distribution_value.upper()
            ]
            return cast(pd.DataFrame, filtered.copy())
        elif distribution_type == 'socioeconomic':
            try:
                socio_level = int(distribution_value)
                filtered = self.suburbs_data[
                    self.suburbs_data['SocioEconomicStatus'] == socio_level
                ]
                return cast(pd.DataFrame, filtered.copy())
            except ValueError:
                return self.suburbs_data
        
        return self.suburbs_data
    
    def _get_suburb_coordinates(self, suburb_name: str) -> tuple[Optional[float], Optional[float]]:
        """
        Get approximate coordinates for a suburb using geocoding
        
        Args:
            suburb_name: Name of the suburb
            
        Returns:
            Tuple of (latitude, longitude) or (None, None) if not available
        """
        if not self.mapbox_api_key:
            return None, None
        
        # Use Mapbox Geocoding API to get suburb coordinates
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{suburb_name}, SA, Australia.json"
        params = {
            'access_token': self.mapbox_api_key,
            'limit': 1,
            'types': 'place'
        }
        
        try:
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            data = response.json()
            
            if data.get('features'):
                coordinates = data['features'][0].get('center', [])
                if len(coordinates) >= 2:
                    return coordinates[1], coordinates[0]  # lat, lon
        
        except requests.RequestException:
            # Silently fail and return None coordinates
            pass
        
        return None, None
    
    def _generate_street_name(self) -> str:
        """
        Generate a random street name
        
        Returns:
            Random street name
        """
        street_names = [
            "Main Street", "High Street", "Church Street", "King Street", "Queen Street",
            "Victoria Street", "George Street", "Elizabeth Street", "North Terrace",
            "South Terrace", "East Terrace", "West Terrace", "Adelaide Street",
            "Franklin Street", "Flinders Street", "Hindley Street", "Rundle Street",
            "Pulteney Street", "Morphett Street", "Light Square", "Hurtle Square",
            "Wellington Square", "Whitmore Square", "Palmer Place", "Gawler Place",
            "Pirie Street", "Waymouth Street", "Currie Street", "Grenfell Street",
            "Angas Street", "Halifax Street", "Carrington Street", "Prospect Road",
            "Magill Road", "Portrush Road", "Glen Osmond Road", "Unley Road",
            "Goodwood Road", "Cross Road", "Marion Road", "Brighton Road",
            "Henley Beach Road", "Port Road", "Grand Junction Road", "Churchill Road",
            "Torrens Road", "Lower North East Road", "Upper Sturt Road", "Main North Road"
        ]
        return random.choice(street_names)
    
    def get_available_options(self) -> Dict[str, List[str]]:
        """
        Get available options for distribution filtering
        
        Returns:
            Dictionary with available suburbs, councils, remoteness levels, and socioeconomic levels
        """
        if self.suburbs_data.empty:
            return {}
        
        return {
            'suburbs': sorted(self.suburbs_data['Suburb'].unique().tolist()),
            'councils': sorted(self.suburbs_data['Council'].unique().tolist()),
            'remoteness_levels': sorted(self.suburbs_data['Remoteness Level'].unique().tolist()),
            'socioeconomic_levels': sorted(self.suburbs_data['SocioEconomicStatus'].unique().tolist())
        }
