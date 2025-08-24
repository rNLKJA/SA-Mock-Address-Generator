"""
Modern API facade for SA Mock Address Generator using SOLID principles

This module provides a clean API that uses dependency injection internally
while maintaining backward compatibility.
"""
import pandas as pd
import logging
from typing import Dict, List, Optional, Any, Union

from .core.dependency_container import get_default_container, configure_default_container
from .interfaces.address_generation import AddressGenerationConfig

logger = logging.getLogger(__name__)


class SAAddressAPI:
    """
    Modern SA Address Generator API using dependency injection
    
    This replaces the old monolithic API with a SOLID-principles based approach
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the SA Address API
        
        Args:
            config: Optional configuration dictionary
        """
        # Configure container with provided config
        if config:
            self.container = configure_default_container(**config)
        else:
            self.container = get_default_container()
        
        # Get the address generator (lazy initialization through container)
        self._address_generator = None
    
    @property
    def address_generator(self):
        """Get the address generator instance"""
        if self._address_generator is None:
            self._address_generator = self.container.get_address_generator()
        return self._address_generator
    
    def generate_addresses(self,
                          count: int,
                          remoteness_weights: Optional[Dict[str, float]] = None,
                          socioeconomic_weights: Optional[Dict[int, float]] = None,
                          preset: Optional[str] = None,
                          random_seed: Optional[int] = None) -> pd.DataFrame:
        """
        Generate South Australian addresses
        
        Args:
            count: Number of addresses to generate
            remoteness_weights: Custom remoteness distribution weights
            socioeconomic_weights: Custom socioeconomic distribution weights
            preset: Use predefined distribution preset
            random_seed: Random seed for reproducible results
            
        Returns:
            DataFrame with generated addresses
        """
        if count <= 0:
            raise ValueError("Count must be positive")
        
        # Create configuration
        if preset:
            # Use preset configuration
            distribution_manager = self.container.get_distribution_manager()
            config = distribution_manager.get_preset_distribution(preset)
            config.count = count
            config.random_seed = random_seed
        else:
            # Use custom or default weights
            config = AddressGenerationConfig(
                count=count,
                remoteness_weights=remoteness_weights,
                socioeconomic_weights=socioeconomic_weights,
                random_seed=random_seed
            )
        
        # Generate addresses
        return self.address_generator.generate_addresses(config)
    
    def lookup_address(self, address_query: str) -> Optional[Dict[str, Any]]:
        """
        Look up address details from a query string
        
        Args:
            address_query: Address string to lookup
            
        Returns:
            Dictionary with address details or None if not found
        """
        # For now, use the data processor to search
        # In a full implementation, this would use an AddressLookup interface
        try:
            data_processor = self.container.get_data_processor()
            
            # Ensure data is loaded
            if not hasattr(data_processor, 'processed_data') or data_processor.processed_data is None:
                data_processor.load_and_process_data('sa_suburbs_data.csv')
            
            # Simple lookup implementation (can be enhanced)
            query_upper = address_query.strip().upper()
            
            # Search by suburb name or postcode
            data = data_processor.processed_data
            
            # Try postcode first
            if query_upper.isdigit() and len(query_upper) == 4:
                postcode = int(query_upper)
                matches = data[data['Postcode'] == postcode]
            else:
                # Search by suburb name
                matches = data[data['Suburb'].str.upper().str.contains(query_upper, na=False)]
            
            if matches.empty:
                return None
            
            # Return first match with coordinates
            result = matches.iloc[0]
            geocoder = self.container.get_suburb_geocoder()
            
            try:
                lat, lng = geocoder.get_suburb_coordinates(result['Suburb'], result['Postcode'])
            except Exception as e:
                logger.warning(f"Failed to get coordinates: {e}")
                lat, lng = None, None
            
            return {
                'suburb': result['Suburb'],
                'postcode': result['Postcode'],
                'state': 'SA',
                'council': result['Council'],
                'remoteness': result['Remoteness Level'],
                'socio_economic_status': result['SocioEconomicStatus'],
                'latitude': lat,
                'longitude': lng,
                'full_address': f"{result['Suburb']}, SA {result['Postcode']}, Australia"
            }
            
        except Exception as e:
            logger.error(f"Address lookup failed: {e}")
            return None
    
    def get_available_presets(self) -> Dict[str, str]:
        """Get available distribution presets with descriptions"""
        distribution_manager = self.container.get_distribution_manager()
        return distribution_manager.get_available_presets()
    
    def create_custom_preset(self,
                           name: str,
                           description: str,
                           remoteness_weights: Optional[Dict[str, float]] = None,
                           socioeconomic_weights: Optional[Dict[int, float]] = None) -> None:
        """
        Create a custom distribution preset
        
        Args:
            name: Name for the preset
            description: Description of the preset
            remoteness_weights: Optional custom remoteness weights
            socioeconomic_weights: Optional custom socioeconomic weights
        """
        distribution_manager = self.container.get_distribution_manager()
        distribution_manager.create_custom_preset(
            name=name,
            description=description,
            remoteness_weights=remoteness_weights,
            socioeconomic_weights=socioeconomic_weights
        )
    
    def export_to_csv(self, addresses: pd.DataFrame, filename: str) -> str:
        """
        Export addresses to CSV file
        
        Args:
            addresses: DataFrame of addresses
            filename: Output filename
            
        Returns:
            Path to created file
        """
        addresses.to_csv(filename, index=False)
        logger.info(f"Exported {len(addresses)} addresses to {filename}")
        return filename
    
    def export_to_json(self, addresses: pd.DataFrame, filename: str) -> str:
        """
        Export addresses to JSON file
        
        Args:
            addresses: DataFrame of addresses
            filename: Output filename
            
        Returns:
            Path to created file
        """
        addresses.to_json(filename, orient='records', indent=2)
        logger.info(f"Exported {len(addresses)} addresses to {filename}")
        return filename
    
    def get_distribution_summary(self, addresses: pd.DataFrame) -> Dict[str, Any]:
        """
        Get summary of address distribution
        
        Args:
            addresses: DataFrame of addresses
            
        Returns:
            Summary statistics
        """
        if addresses.empty:
            return {'error': 'No addresses to analyze'}
        
        assembler = self.container.get_address_assembler()
        return assembler.get_address_summary(addresses.to_dict('records'))
    
    def validate_addresses(self, addresses: pd.DataFrame) -> Dict[str, Any]:
        """
        Validate generated addresses
        
        Args:
            addresses: DataFrame of addresses to validate
            
        Returns:
            Validation results
        """
        return self.address_generator.validate_generated_addresses(addresses)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive statistics about the API usage"""
        stats = {}
        
        # Address generation stats
        if self._address_generator:
            stats['generation'] = self.address_generator.get_generation_stats()
        
        # Container info
        stats['container'] = self.container.get_container_info()
        
        # Data summary
        try:
            stats['data'] = self.address_generator.get_data_summary()
        except Exception as e:
            stats['data'] = {'error': str(e)}
        
        return stats
    
    def reset_statistics(self) -> None:
        """Reset all statistics"""
        if self._address_generator:
            self.address_generator.reset_stats()
    
    def configure(self, **kwargs) -> 'SAAddressAPI':
        """
        Configure the API with additional settings
        
        Args:
            **kwargs: Configuration options
            
        Returns:
            Self for method chaining
        """
        self.container.configure(**kwargs)
        # Reset cached generator to pick up new config
        self._address_generator = None
        return self


# Convenience functions for backward compatibility and simple usage
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
        preset: Use predefined distribution preset
        output_file: Optional CSV filename to save results
        random_seed: Random seed for reproducible results
        
    Returns:
        DataFrame with generated addresses
    """
    api = SAAddressAPI()
    
    addresses = api.generate_addresses(
        count=count,
        remoteness_weights=remoteness_weights,
        socioeconomic_weights=socioeconomic_weights,
        preset=preset,
        random_seed=random_seed
    )
    
    if output_file:
        api.export_to_csv(addresses, output_file)
        print(f"Exported {len(addresses)} addresses to {output_file}")
    
    return addresses


def lookup_sa_address(address_query: str) -> Optional[Dict[str, Any]]:
    """
    Convenience function to lookup SA address details
    
    Args:
        address_query: Address string to lookup
        
    Returns:
        Dictionary with address details or None if not found
    """
    api = SAAddressAPI()
    return api.lookup_address(address_query)


def get_available_presets() -> Dict[str, str]:
    """Get available distribution presets"""
    api = SAAddressAPI()
    return api.get_available_presets()


def configure_api(**kwargs) -> None:
    """Configure the global API settings"""
    configure_default_container(**kwargs)
