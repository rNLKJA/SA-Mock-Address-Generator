"""
Address assembler implementation following Single Responsibility Principle
"""
import logging
from typing import Dict, Any, Tuple, Optional

from ..interfaces.address_generation import AddressAssembler

logger = logging.getLogger(__name__)


class SAAddressAssembler(AddressAssembler):
    """South Australian address assembler implementation"""
    
    def __init__(self):
        """Initialize SA address assembler"""
        self.state_code = "SA"
        self.country = "Australia"
    
    def assemble_address(self,
                        street_address: str,
                        suburb_info: Dict[str, Any],
                        coordinates: Tuple[float, float]) -> Dict[str, Any]:
        """
        Assemble a complete address record
        
        Args:
            street_address: Generated street address (e.g., "123 Main Street")
            suburb_info: Dictionary with suburb information
            coordinates: Tuple of (latitude, longitude)
            
        Returns:
            Complete address record dictionary
        """
        if not street_address or not street_address.strip():
            raise ValueError("Street address cannot be empty")
        
        if not suburb_info:
            raise ValueError("Suburb info cannot be empty")
        
        required_suburb_fields = ['suburb', 'postcode', 'council', 'socio_status', 'remoteness']
        missing_fields = [field for field in required_suburb_fields if field not in suburb_info]
        if missing_fields:
            raise ValueError(f"Missing required suburb fields: {missing_fields}")
        
        if not coordinates or len(coordinates) != 2:
            raise ValueError("Coordinates must be a tuple of (latitude, longitude)")
        
        latitude, longitude = coordinates
        
        # Validate coordinate ranges (basic validation for Australian coordinates)
        if not (-50 <= latitude <= -10) or not (110 <= longitude <= 160):
            logger.warning(f"Coordinates appear to be outside Australian bounds: ({latitude}, {longitude})")
        
        # Assemble the complete address
        assembled_address = {
            # Basic address components
            'street_address': street_address.strip(),
            'suburb': str(suburb_info['suburb']).strip(),
            'state': self.state_code,
            'postcode': self._format_postcode(suburb_info['postcode']),
            'country': self.country,
            
            # Coordinates
            'latitude': round(float(latitude), 6),
            'longitude': round(float(longitude), 6),
            
            # Administrative and demographic information
            'council': str(suburb_info['council']).strip(),
            'remoteness': str(suburb_info['remoteness']).strip(),
            'socio_status': int(suburb_info['socio_status']),
            
            # Composite fields
            'full_address': self._create_full_address(
                street_address, 
                suburb_info['suburb'], 
                suburb_info['postcode']
            ),
            
            # Additional metadata
            'address_type': self._determine_address_type(street_address),
            'region_type': self._determine_region_type(suburb_info['remoteness'])
        }
        
        # Add optional weight if available
        if 'weight' in suburb_info:
            assembled_address['sampling_weight'] = float(suburb_info['weight'])
        
        return assembled_address
    
    def _format_postcode(self, postcode) -> str:
        """Format postcode as 4-digit string"""
        try:
            postcode_int = int(postcode)
            return f"{postcode_int:04d}"  # Zero-pad to 4 digits
        except (ValueError, TypeError):
            logger.error(f"Invalid postcode format: {postcode}")
            return str(postcode)
    
    def _create_full_address(self, street_address: str, suburb: str, postcode) -> str:
        """Create formatted full address string"""
        formatted_postcode = self._format_postcode(postcode)
        return f"{street_address}, {suburb} {self.state_code} {formatted_postcode}, {self.country}"
    
    def _determine_address_type(self, street_address: str) -> str:
        """Determine address type based on street address format"""
        address_lower = street_address.lower()
        
        if 'unit' in address_lower or 'apt' in address_lower or 'apartment' in address_lower:
            return 'unit'
        elif '/' in street_address and not street_address.startswith('/'):
            # Format like "2/45 Main Street" (unit/house number)
            return 'unit'
        elif any(word in address_lower for word in ['shop', 'suite', 'level', 'floor']):
            return 'commercial'
        else:
            return 'house'
    
    def _determine_region_type(self, remoteness: str) -> str:
        """Determine simplified region type from remoteness level"""
        remoteness_lower = remoteness.lower()
        
        if 'major cities' in remoteness_lower:
            return 'urban'
        elif 'inner regional' in remoteness_lower:
            return 'regional'
        elif 'outer regional' in remoteness_lower:
            return 'rural'
        elif 'remote' in remoteness_lower or 'very remote' in remoteness_lower:
            return 'remote'
        else:
            return 'unknown'
    
    def validate_assembled_address(self, address: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate an assembled address
        
        Args:
            address: Assembled address dictionary
            
        Returns:
            Validation results with 'valid' boolean and list of issues
        """
        validation_result = {
            'valid': True,
            'warnings': [],
            'errors': []
        }
        
        # Required fields
        required_fields = [
            'street_address', 'suburb', 'state', 'postcode', 'country',
            'latitude', 'longitude', 'council', 'remoteness', 'socio_status', 'full_address'
        ]
        
        missing_fields = [field for field in required_fields if field not in address]
        if missing_fields:
            validation_result['errors'].extend([f"Missing field: {field}" for field in missing_fields])
            validation_result['valid'] = False
        
        # Validate specific fields if present
        if 'postcode' in address:
            postcode = str(address['postcode'])
            if not postcode.isdigit() or len(postcode) != 4:
                validation_result['errors'].append(f"Invalid postcode format: {postcode}")
                validation_result['valid'] = False
            elif not postcode.startswith('5'):
                validation_result['warnings'].append(f"Postcode {postcode} may not be a SA postcode")
        
        if 'state' in address and address['state'] != self.state_code:
            validation_result['warnings'].append(f"State is {address['state']}, expected {self.state_code}")
        
        if 'socio_status' in address:
            socio_status = address['socio_status']
            if not isinstance(socio_status, int) or not (0 <= socio_status <= 5):
                validation_result['errors'].append(f"Invalid socio_status: {socio_status} (must be 0-5)")
                validation_result['valid'] = False
        
        # Validate coordinates
        if 'latitude' in address and 'longitude' in address:
            lat, lng = address['latitude'], address['longitude']
            try:
                lat, lng = float(lat), float(lng)
                # Basic Australian bounds check
                if not (-50 <= lat <= -10):
                    validation_result['warnings'].append(f"Latitude {lat} outside Australian range")
                if not (110 <= lng <= 160):
                    validation_result['warnings'].append(f"Longitude {lng} outside Australian range")
                    
                # SA specific bounds (more restrictive)
                if not (-38 <= lat <= -25):
                    validation_result['warnings'].append(f"Latitude {lat} outside SA range")
                if not (129 <= lng <= 141):
                    validation_result['warnings'].append(f"Longitude {lng} outside SA range")
                    
            except (ValueError, TypeError):
                validation_result['errors'].append("Invalid coordinate format")
                validation_result['valid'] = False
        
        return validation_result
    
    def format_address_for_display(self, address: Dict[str, Any], format_type: str = 'full') -> str:
        """
        Format address for different display purposes
        
        Args:
            address: Address dictionary
            format_type: 'full', 'short', 'postal', 'coordinates'
            
        Returns:
            Formatted address string
        """
        if format_type == 'full':
            return address.get('full_address', '')
        
        elif format_type == 'short':
            return f"{address.get('street_address', '')}, {address.get('suburb', '')} {address.get('postcode', '')}"
        
        elif format_type == 'postal':
            return f"{address.get('suburb', '')} {address.get('state', '')} {address.get('postcode', '')}"
        
        elif format_type == 'coordinates':
            lat = address.get('latitude', 0)
            lng = address.get('longitude', 0)
            return f"({lat:.6f}, {lng:.6f})"
        
        else:
            raise ValueError(f"Unknown format_type: {format_type}")
    
    def get_address_summary(self, addresses: list) -> Dict[str, Any]:
        """
        Get summary statistics for a list of assembled addresses
        
        Args:
            addresses: List of assembled address dictionaries
            
        Returns:
            Summary statistics
        """
        if not addresses:
            return {'error': 'No addresses to analyze'}
        
        # Count by various categories
        address_types = {}
        region_types = {}
        councils = {}
        remoteness_levels = {}
        socio_statuses = {}
        
        for addr in addresses:
            # Address types
            addr_type = addr.get('address_type', 'unknown')
            address_types[addr_type] = address_types.get(addr_type, 0) + 1
            
            # Region types
            region_type = addr.get('region_type', 'unknown')
            region_types[region_type] = region_types.get(region_type, 0) + 1
            
            # Councils
            council = addr.get('council', 'unknown')
            councils[council] = councils.get(council, 0) + 1
            
            # Remoteness
            remoteness = addr.get('remoteness', 'unknown')
            remoteness_levels[remoteness] = remoteness_levels.get(remoteness, 0) + 1
            
            # Socio-economic status
            socio = addr.get('socio_status', 'unknown')
            socio_statuses[socio] = socio_statuses.get(socio, 0) + 1
        
        # Calculate coordinate bounds
        lats = [addr['latitude'] for addr in addresses if 'latitude' in addr]
        lngs = [addr['longitude'] for addr in addresses if 'longitude' in addr]
        
        coordinate_bounds = {}
        if lats and lngs:
            coordinate_bounds = {
                'latitude_range': {'min': min(lats), 'max': max(lats)},
                'longitude_range': {'min': min(lngs), 'max': max(lngs)}
            }
        
        return {
            'total_addresses': len(addresses),
            'address_type_distribution': address_types,
            'region_type_distribution': region_types,
            'council_distribution': councils,
            'remoteness_distribution': remoteness_levels,
            'socioeconomic_distribution': socio_statuses,
            'coordinate_bounds': coordinate_bounds,
            'unique_suburbs': len(set(addr.get('suburb', '') for addr in addresses)),
            'unique_postcodes': len(set(addr.get('postcode', '') for addr in addresses))
        }
