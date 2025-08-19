#!/usr/bin/env python3
"""
South Australia Address Generator - Clean API
Generates realistic SA addresses based on user-defined distribution parameters
"""
import pandas as pd
import random
from typing import Dict, List, Optional, Union, Tuple
import logging
from dataclasses import dataclass
import re

from data_processor import SADataProcessor
from suburb_geocoder import SuburbGeocoder

# Set up logging
logging.basicConfig(level=logging.WARNING)  # Reduce log noise
logger = logging.getLogger(__name__)


@dataclass
class DistributionParams:
    """Parameters for address distribution"""
    remoteness_weights: Optional[Dict[str, float]] = None
    socioeconomic_weights: Optional[Dict[int, float]] = None
    
    def __post_init__(self):
        # Default remoteness weights (balanced)
        if self.remoteness_weights is None:
            self.remoteness_weights = {
                'Major Cities of Australia': 0.4,
                'Inner Regional Australia': 0.25,
                'Outer Regional Australia': 0.2,
                'Remote Australia': 0.1,
                'Very Remote Australia': 0.05,
                'Not Applicable': 0.0
            }
        
        # Default socioeconomic weights (balanced)
        if self.socioeconomic_weights is None:
            self.socioeconomic_weights = {
                0: 0.05,  # Very low
                1: 0.10,  # Low
                2: 0.20,  # Below average
                3: 0.25,  # Average
                4: 0.25,  # Above average
                5: 0.15   # High
            }


class SAAddressAPI:
    """Clean API for generating South Australian addresses"""
    
    def __init__(self, csv_file: str = "data/sa_suburbs_data.csv"):
        """
        Initialize the address generator
        
        Args:
            csv_file: Path to SA suburb data CSV
        """
        self.data_processor = SADataProcessor(csv_file)
        self.geocoder = SuburbGeocoder()
        
        # Load suburb lookup data for fast access
        self.suburb_lookup = self._create_suburb_lookup()
    
    def _create_suburb_lookup(self) -> Dict[str, Dict]:
        """Create fast lookup dictionary for suburb data"""
        lookup = {}
        for _, row in self.data_processor.processed_df.iterrows():
            key = f"{row['Suburb']}_{row['Postcode']}"
            lookup[key] = {
                'suburb': row['Suburb'],
                'postcode': int(row['Postcode']),
                'council': row['Council'],
                'socio_status': int(row['SocioEconomicStatus']),
                'remoteness': row['Remoteness Level']
            }
        return lookup
    
    def generate_addresses(self, 
                          count: int,
                          distribution: Optional[DistributionParams] = None,
                          random_seed: Optional[int] = None) -> pd.DataFrame:
        """
        Generate n addresses based on distribution parameters
        
        Args:
            count: Number of addresses to generate
            distribution: Distribution parameters for remoteness/socioeconomic weighting
            random_seed: Random seed for reproducible results
            
        Returns:
            DataFrame with columns: street_address, suburb, postcode, latitude, longitude,
                                  council, remoteness, socio_status
        """
        if distribution is None:
            distribution = DistributionParams()
        
        if random_seed:
            random.seed(random_seed)
        
        # Sample suburbs based on distribution weights
        sampled_suburbs = self.data_processor.get_sample_suburbs(
            count=count,
            remoteness_weights=distribution.remoteness_weights,
            socioeconomic_weights=distribution.socioeconomic_weights,
            random_seed=random_seed
        )
        
        # Generate addresses with coordinates
        addresses = []
        street_names = [
            "Main Street", "High Street", "King Street", "Queen Street", "Church Street",
            "Victoria Street", "George Street", "Elizabeth Street", "Smith Street", "Jones Street",
            "Brown Street", "Wilson Street", "Taylor Street", "Johnson Street", "Williams Street",
            "Adelaide Road", "Melbourne Road", "Sydney Road", "Brisbane Road", "Perth Road",
            "North Road", "South Road", "East Road", "West Road", "Central Avenue"
        ]
        
        for suburb_info in sampled_suburbs:
            # Generate street address
            street_number = random.randint(1, 999)
            street_name = random.choice(street_names)
            street_address = f"{street_number} {street_name}"
            
            # Get coordinates
            base_lat, base_lng = self.geocoder.get_suburb_coordinates(
                suburb_info['suburb'], suburb_info['postcode']
            )
            lat, lng = self.geocoder.generate_random_nearby_coordinates(
                base_lat, base_lng, radius_km=1.0
            )
            
            addresses.append({
                'street_address': street_address,
                'suburb': suburb_info['suburb'],
                'postcode': suburb_info['postcode'],
                'latitude': round(lat, 6),
                'longitude': round(lng, 6),
                'council': suburb_info['council'],
                'remoteness': suburb_info['remoteness'],
                'socio_status': suburb_info['socio_status']
            })
        
        return pd.DataFrame(addresses)
    
    def create_distribution_presets(self) -> Dict[str, DistributionParams]:
        """Create predefined distribution presets"""
        return {
            'city_focused': DistributionParams(
                remoteness_weights={
                    'Major Cities of Australia': 0.7,
                    'Inner Regional Australia': 0.2,
                    'Outer Regional Australia': 0.08,
                    'Remote Australia': 0.02,
                    'Very Remote Australia': 0.0,
                    'Not Applicable': 0.0
                }
            ),
            'regional_focused': DistributionParams(
                remoteness_weights={
                    'Major Cities of Australia': 0.2,
                    'Inner Regional Australia': 0.3,
                    'Outer Regional Australia': 0.4,
                    'Remote Australia': 0.1,
                    'Very Remote Australia': 0.0,
                    'Not Applicable': 0.0
                }
            ),
            'remote_focused': DistributionParams(
                remoteness_weights={
                    'Major Cities of Australia': 0.1,
                    'Inner Regional Australia': 0.2,
                    'Outer Regional Australia': 0.3,
                    'Remote Australia': 0.3,
                    'Very Remote Australia': 0.1,
                    'Not Applicable': 0.0
                }
            ),
            'high_socio': DistributionParams(
                socioeconomic_weights={
                    0: 0.02,
                    1: 0.05,
                    2: 0.13,
                    3: 0.20,
                    4: 0.30,
                    5: 0.30
                }
            ),
            'low_socio': DistributionParams(
                socioeconomic_weights={
                    0: 0.20,
                    1: 0.30,
                    2: 0.25,
                    3: 0.15,
                    4: 0.08,
                    5: 0.02
                }
            )
        }
    
    def export_to_csv(self, addresses: pd.DataFrame, filename: str = "sa_addresses.csv") -> str:
        """
        Export addresses to CSV file
        
        Args:
            addresses: DataFrame of addresses
            filename: Output filename
            
        Returns:
            Path to created file
        """
        addresses.to_csv(filename, index=False)
        return filename
    
    def get_distribution_summary(self, addresses: pd.DataFrame) -> Dict:
        """Get summary of address distribution"""
        if addresses.empty:
            return {'error': 'No addresses to analyze'}
        
        return {
            'total_count': len(addresses),
            'unique_suburbs': addresses['suburb'].nunique(),
            'remoteness_distribution': addresses['remoteness'].value_counts().to_dict(),
            'socioeconomic_distribution': addresses['socio_status'].value_counts().to_dict(),
            'top_suburbs': addresses['suburb'].value_counts().head(10).to_dict(),
            'coordinate_bounds': {
                'lat_min': addresses['latitude'].min(),
                'lat_max': addresses['latitude'].max(),
                'lng_min': addresses['longitude'].min(),
                'lng_max': addresses['longitude'].max()
            }
        }
    
    def lookup_address(self, address: str) -> Optional[Dict]:
        """
        Look up address details including council, remoteness, and socio-economic index
        
        Args:
            address: Address string (can be partial, e.g., "Adelaide", "5000", "Adelaide 5000")
            
        Returns:
            Dictionary with address details or None if not found
        """
        if not address or not address.strip():
            return None
            
        address = address.strip().upper()
        
        # Try to extract suburb and postcode from the address
        suburb_match = None
        postcode_match = None
        
        # Look for postcode pattern (4 digits starting with 5)
        postcode_pattern = r'\b5\d{3}\b'
        postcode_matches = re.findall(postcode_pattern, address)
        if postcode_matches:
            postcode_match = int(postcode_matches[0])
        
        # Remove postcode and common address parts to get suburb
        clean_address = re.sub(postcode_pattern, '', address)
        clean_address = re.sub(r'\b(SA|SOUTH AUSTRALIA|AUSTRALIA)\b', '', clean_address)
        clean_address = re.sub(r'[,\-]+', ' ', clean_address)
        clean_address = ' '.join(clean_address.split())  # Remove extra spaces
        
        # Search strategies
        results = []
        
        # Strategy 1: Exact suburb match
        if clean_address:
            exact_matches = self.data_processor.processed_df[
                self.data_processor.processed_df['Suburb'].str.upper() == clean_address
            ]
            if not exact_matches.empty:
                results.extend(exact_matches.to_dict('records'))
        
        # Strategy 2: Postcode match
        if postcode_match:
            postcode_matches = self.data_processor.processed_df[
                self.data_processor.processed_df['Postcode'] == postcode_match
            ]
            if not postcode_matches.empty:
                results.extend(postcode_matches.to_dict('records'))
        
        # Strategy 3: Partial suburb match
        if clean_address and len(results) == 0:
            partial_matches = self.data_processor.processed_df[
                self.data_processor.processed_df['Suburb'].str.upper().str.contains(clean_address, na=False)
            ]
            if not partial_matches.empty:
                results.extend(partial_matches.to_dict('records'))
        
        # Strategy 4: Try original input as suburb
        if len(results) == 0:
            original_matches = self.data_processor.processed_df[
                self.data_processor.processed_df['Suburb'].str.upper().str.contains(address, na=False)
            ]
            if not original_matches.empty:
                results.extend(original_matches.to_dict('records'))
        
        if not results:
            return None
        
        # If multiple results, prefer exact matches or return the first one
        if len(results) == 1:
            result = results[0]
        else:
            # Prefer exact suburb matches
            exact_suburb_matches = [r for r in results if r['Suburb'].upper() == clean_address]
            if exact_suburb_matches:
                result = exact_suburb_matches[0]
            else:
                # If we have a postcode, prefer matches with that postcode
                if postcode_match:
                    postcode_matches = [r for r in results if r['Postcode'] == postcode_match]
                    if postcode_matches:
                        result = postcode_matches[0]
                    else:
                        result = results[0]
                else:
                    result = results[0]
        
        # Get coordinates using geocoder
        try:
            lat, lng = self.geocoder.get_suburb_coordinates(result['Suburb'], result['Postcode'])
        except Exception as e:
            logger.warning(f"Failed to get coordinates for {result['Suburb']}: {e}")
            lat, lng = None, None
        
        # Format the response
        formatted_result = {
            'full_address': f"{result['Suburb']}, SA {result['Postcode']}, Australia",
            'suburb': result['Suburb'],
            'state': 'SA',
            'postcode': result['Postcode'],
            'council': result['Council'],
            'remoteness': result['Remoteness Level'],
            'socio_economic_index': result['SocioEconomicStatus'],
            'latitude': round(lat, 6) if lat else None,
            'longitude': round(lng, 6) if lng else None,
            'search_query': address
        }
        
        return formatted_result


def generate_sa_addresses(count: int, 
                         remoteness_weights: Optional[Dict[str, float]] = None,
                         socioeconomic_weights: Optional[Dict[int, float]] = None,
                         preset: Optional[str] = None,
                         output_file: Optional[str] = None,
                         random_seed: Optional[int] = None) -> pd.DataFrame:
    """
    Convenience function to generate SA addresses
    
    Args:
        count: Number of addresses to generate
        remoteness_weights: Custom remoteness distribution weights
        socioeconomic_weights: Custom socioeconomic distribution weights
        preset: Use predefined distribution ('city_focused', 'regional_focused', etc.)
        output_file: Optional CSV filename to save results
        random_seed: Random seed for reproducible results
        
    Returns:
        DataFrame with generated addresses
    """
    api = SAAddressAPI()
    
    # Handle preset
    if preset:
        presets = api.create_distribution_presets()
        if preset in presets:
            distribution = presets[preset]
        else:
            available = ', '.join(presets.keys())
            raise ValueError(f"Unknown preset '{preset}'. Available: {available}")
    else:
        distribution = DistributionParams(
            remoteness_weights=remoteness_weights,
            socioeconomic_weights=socioeconomic_weights
        )
    
    # Generate addresses
    addresses = api.generate_addresses(count, distribution, random_seed)
    
    # Export if requested
    if output_file:
        api.export_to_csv(addresses, output_file)
        print(f"Exported {len(addresses)} addresses to {output_file}")
    
    return addresses


def lookup_sa_address(address: str, csv_file: str = "data/sa_suburbs_data.csv") -> Optional[Dict]:
    """
    Standalone function to lookup SA address details
    
    Args:
        address: Address string to lookup
        csv_file: Path to SA suburbs data CSV
        
    Returns:
        Dictionary with address details or None if not found
    """
    api = SAAddressAPI(csv_file=csv_file)
    return api.lookup_address(address)



