"""
Street address generation implementation following Single Responsibility Principle
"""
import random
import logging
from typing import List, Optional
from ..interfaces.address_generation import StreetAddressGenerator

logger = logging.getLogger(__name__)


class AustralianStreetAddressGenerator(StreetAddressGenerator):
    """Generate realistic Australian street addresses"""
    
    def __init__(self, custom_street_names: Optional[List[str]] = None):
        """
        Initialize street address generator
        
        Args:
            custom_street_names: Optional custom list of street names
        """
        # Common Australian street names
        self.default_street_names = [
            # Common street names
            "Main Street", "High Street", "King Street", "Queen Street", "Church Street",
            "Victoria Street", "George Street", "Elizabeth Street", "Smith Street", "Jones Street",
            "Brown Street", "Wilson Street", "Taylor Street", "Johnson Street", "Williams Street",
            "Adelaide Road", "Melbourne Road", "Sydney Road", "Brisbane Road", "Perth Road",
            "North Road", "South Road", "East Road", "West Road", "Central Avenue",
            
            # South Australian specific
            "Torrens Road", "Gawler Street", "Flinders Street", "Hindley Street", "Rundle Street",
            "Pulteney Street", "Morphett Street", "Light Street", "Waymouth Street", "Grenfell Street",
            "Currie Street", "Franklin Street", "Gouger Street", "Wright Street", "Hutt Street",
            "Glen Osmond Road", "Magill Road", "Portrush Road", "Anzac Highway", "Brighton Road",
            
            # Common road types with generic names
            "Park Avenue", "Mill Road", "Hill Drive", "Valley Road", "Creek Road",
            "Ridge Drive", "Garden Street", "Forest Road", "Lake Drive", "River Road",
            "Station Road", "School Street", "Hospital Road", "Police Road", "Post Office Road",
            
            # Residential patterns
            "Oak Street", "Pine Road", "Maple Avenue", "Cedar Close", "Birch Street",
            "Rose Street", "Lily Avenue", "Jasmine Close", "Violet Street", "Daisy Road",
            "First Street", "Second Street", "Third Street", "Fourth Street", "Fifth Street",
            
            # Suburbs/localities as street names
            "Norwood Avenue", "Burnside Road", "Unley Road", "Prospect Road", "Marion Road",
            "Glenelg Road", "Brighton Road", "Henley Beach Road", "Port Road", "Salisbury Road"
        ]
        
        self.street_names = custom_street_names or self.default_street_names
        
        # Street number ranges for different area types
        self.number_ranges = {
            'urban': (1, 999),      # Dense urban areas
            'suburban': (1, 500),   # Typical suburban areas  
            'rural': (1, 200),      # Rural or sparse areas
            'industrial': (1, 100)  # Industrial areas
        }
        
        # Default range
        self.default_range = self.number_ranges['suburban']
    
    def generate_street_address(self, area_type: str = 'suburban') -> str:
        """
        Generate a random street address
        
        Args:
            area_type: Type of area ('urban', 'suburban', 'rural', 'industrial')
            
        Returns:
            Generated street address
        """
        # Get appropriate number range
        min_num, max_num = self.number_ranges.get(area_type, self.default_range)
        
        # Generate street number
        street_number = random.randint(min_num, max_num)
        
        # Choose random street name
        street_name = random.choice(self.street_names)
        
        # Generate unit number occasionally (for apartments/units)
        if area_type == 'urban' and random.random() < 0.3:  # 30% chance in urban areas
            unit_number = random.randint(1, 20)
            return f"Unit {unit_number}/{street_number} {street_name}"
        elif area_type == 'suburban' and random.random() < 0.1:  # 10% chance in suburban
            unit_number = random.randint(1, 10)
            return f"{unit_number}/{street_number} {street_name}"
        else:
            return f"{street_number} {street_name}"
    
    def generate_multiple_addresses(self, 
                                   count: int, 
                                   area_type: str = 'suburban') -> List[str]:
        """
        Generate multiple street addresses
        
        Args:
            count: Number of addresses to generate
            area_type: Type of area for all addresses
            
        Returns:
            List of generated street addresses
        """
        return [self.generate_street_address(area_type) for _ in range(count)]
    
    def add_street_names(self, new_names: List[str]) -> None:
        """
        Add new street names to the generator
        
        Args:
            new_names: List of street names to add
        """
        self.street_names.extend(new_names)
        logger.info(f"Added {len(new_names)} new street names")
    
    def get_street_names(self) -> List[str]:
        """Get current list of street names"""
        return self.street_names.copy()
    
    def set_custom_number_range(self, area_type: str, min_num: int, max_num: int) -> None:
        """
        Set custom number range for an area type
        
        Args:
            area_type: Area type identifier
            min_num: Minimum street number
            max_num: Maximum street number
        """
        if min_num >= max_num:
            raise ValueError("min_num must be less than max_num")
        
        if min_num < 1:
            raise ValueError("min_num must be at least 1")
        
        self.number_ranges[area_type] = (min_num, max_num)
        logger.info(f"Set custom number range for {area_type}: {min_num}-{max_num}")
    
    def get_area_types(self) -> List[str]:
        """Get available area types"""
        return list(self.number_ranges.keys())
    
    def get_statistics(self) -> dict:
        """Get generator statistics"""
        return {
            'total_street_names': len(self.street_names),
            'area_types': self.get_area_types(),
            'number_ranges': self.number_ranges.copy(),
            'default_range': self.default_range
        }
