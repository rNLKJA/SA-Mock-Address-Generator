"""
Address generator implementation using dependency injection and SOLID principles
"""
import pandas as pd
import logging
from typing import Optional, List, Dict, Any

from ..interfaces.address_generation import (
    AddressGenerator, AddressGenerationConfig, StreetAddressGenerator,
    DistributionManager, AddressAssembler
)
from ..interfaces.geocoding import SuburbGeocoder
from ..interfaces.data_processing import DataProcessor

logger = logging.getLogger(__name__)


class SAAddressGeneratorImpl(AddressGenerator):
    """
    South Australian address generator implementation
    
    Uses dependency injection to compose address generation functionality
    """
    
    def __init__(self,
                 data_processor: DataProcessor,
                 suburb_geocoder: SuburbGeocoder,
                 street_generator: StreetAddressGenerator,
                 distribution_manager: DistributionManager,
                 address_assembler: AddressAssembler,
                 default_data_source: Optional[str] = None):
        """
        Initialize address generator with injected dependencies
        
        Args:
            data_processor: Data processing implementation
            suburb_geocoder: Suburb geocoding implementation
            street_generator: Street address generation implementation
            distribution_manager: Distribution management implementation
            address_assembler: Address assembly implementation
            default_data_source: Default data source for suburb data
        """
        self.data_processor = data_processor
        self.suburb_geocoder = suburb_geocoder
        self.street_generator = street_generator
        self.distribution_manager = distribution_manager
        self.address_assembler = address_assembler
        self.default_data_source = default_data_source
        
        # Generation statistics
        self.generation_stats = {
            'total_generated': 0,
            'successful_generations': 0,
            'failed_generations': 0,
            'cache_usage': 0,
            'api_calls': 0,
            'fallback_usage': 0
        }
        
        # Data loaded flag
        self._data_loaded = False
    
    def generate_addresses(self, config: AddressGenerationConfig) -> pd.DataFrame:
        """
        Generate addresses based on configuration
        
        Args:
            config: Address generation configuration
            
        Returns:
            DataFrame with generated addresses
        """
        logger.info(f"Generating {config.count} addresses")
        
        # Validate configuration
        if not self.distribution_manager.validate_distribution(config):
            raise ValueError("Invalid distribution configuration")
        
        if config.count <= 0:
            logger.warning("No addresses requested")
            return pd.DataFrame()
        
        # Ensure data is loaded
        self._ensure_data_loaded()
        
        # Set random seed if provided
        if config.random_seed is not None:
            import random
            random.seed(config.random_seed)
        
        try:
            # Get distribution weights
            remoteness_weights = config.remoteness_weights or self.distribution_manager.get_default_distribution().remoteness_weights
            socioeconomic_weights = config.socioeconomic_weights or self.distribution_manager.get_default_distribution().socioeconomic_weights
            
            # Sample suburbs based on distribution
            sampled_suburbs = self.data_processor.get_sample_suburbs(
                count=config.count,
                remoteness_weights=remoteness_weights,
                socioeconomic_weights=socioeconomic_weights,
                random_seed=config.random_seed
            )
            
            if not sampled_suburbs:
                logger.error("No suburbs were sampled")
                return pd.DataFrame()
            
            # Generate addresses for each sampled suburb
            addresses = []
            for i, suburb_info in enumerate(sampled_suburbs):
                try:
                    address = self._generate_single_address(suburb_info)
                    addresses.append(address)
                    self.generation_stats['successful_generations'] += 1
                    
                    # Progress logging for large batches
                    if (i + 1) % 100 == 0:
                        logger.info(f"Generated {i + 1}/{len(sampled_suburbs)} addresses")
                        
                except Exception as e:
                    logger.warning(f"Failed to generate address for {suburb_info.get('suburb', 'unknown')}: {e}")
                    self.generation_stats['failed_generations'] += 1
            
            self.generation_stats['total_generated'] += len(addresses)
            
            if not addresses:
                logger.error("No addresses were successfully generated")
                return pd.DataFrame()
            
            # Convert to DataFrame
            df = pd.DataFrame(addresses)
            
            logger.info(f"Successfully generated {len(df)} addresses")
            return df
            
        except Exception as e:
            logger.error(f"Address generation failed: {e}")
            raise
    
    def _generate_single_address(self, suburb_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a single address from suburb information
        
        Args:
            suburb_info: Dictionary with suburb details
            
        Returns:
            Complete address dictionary
        """
        suburb = suburb_info['suburb']
        postcode = suburb_info['postcode']
        
        # Generate street address
        # Determine area type based on remoteness for more realistic street addresses
        area_type = self._get_area_type_from_remoteness(suburb_info['remoteness'])
        street_address = self.street_generator.generate_street_address(area_type)
        
        # Get coordinates for the suburb
        base_lat, base_lng = self.suburb_geocoder.get_suburb_coordinates(suburb, postcode)
        
        # Generate random nearby coordinates for variety
        final_lat, final_lng = self.suburb_geocoder.generate_random_nearby_coordinates(
            base_lat, base_lng, radius_km=1.5
        )
        
        # Assemble complete address
        complete_address = self.address_assembler.assemble_address(
            street_address=street_address,
            suburb_info=suburb_info,
            coordinates=(final_lat, final_lng)
        )
        
        return complete_address
    
    def _get_area_type_from_remoteness(self, remoteness: str) -> str:
        """Map remoteness level to street address area type"""
        remoteness_lower = remoteness.lower()
        
        if 'major cities' in remoteness_lower:
            return 'urban'
        elif 'inner regional' in remoteness_lower:
            return 'suburban'
        elif 'outer regional' in remoteness_lower:
            return 'suburban'
        elif 'remote' in remoteness_lower:
            return 'rural'
        else:
            return 'suburban'  # Default
    
    def _ensure_data_loaded(self) -> None:
        """Ensure suburb data is loaded"""
        if not self._data_loaded:
            if self.default_data_source:
                logger.info(f"Loading suburb data from {self.default_data_source}")
                self.data_processor.load_and_process_data(self.default_data_source)
                self._data_loaded = True
            else:
                raise ValueError("No data source configured and no data loaded")
    
    def load_data_source(self, data_source: str) -> None:
        """
        Load data from a specific source
        
        Args:
            data_source: Path to data source
        """
        logger.info(f"Loading data from {data_source}")
        self.data_processor.load_and_process_data(data_source)
        self._data_loaded = True
    
    def get_generation_stats(self) -> Dict[str, Any]:
        """Get address generation statistics"""
        stats = self.generation_stats.copy()
        
        # Add geocoding stats if available
        if hasattr(self.suburb_geocoder, 'get_geocoding_stats'):
            geocoding_stats = self.suburb_geocoder.get_geocoding_stats()
            stats.update({
                'geocoding_cache_hits': geocoding_stats.get('cache_hits', 0),
                'geocoding_api_calls': geocoding_stats.get('api_calls', 0),
                'geocoding_fallback_usage': geocoding_stats.get('fallback_used', 0),
                'geocoding_errors': geocoding_stats.get('errors', 0)
            })
        
        # Add data processor stats if available
        if hasattr(self.data_processor, 'processing_stats'):
            processing_stats = getattr(self.data_processor, 'processing_stats', {})
            stats.update({
                'data_records_loaded': processing_stats.get('records_loaded', 0),
                'data_records_cleaned': processing_stats.get('records_after_cleaning', 0),
                'data_load_time': processing_stats.get('load_time', 0),
                'data_clean_time': processing_stats.get('clean_time', 0)
            })
        
        # Calculate rates
        total_attempts = stats['successful_generations'] + stats['failed_generations']
        if total_attempts > 0:
            stats['success_rate'] = (stats['successful_generations'] / total_attempts) * 100
        else:
            stats['success_rate'] = 0
        
        return stats
    
    def reset_stats(self) -> None:
        """Reset generation statistics"""
        self.generation_stats = {
            'total_generated': 0,
            'successful_generations': 0,
            'failed_generations': 0,
            'cache_usage': 0,
            'api_calls': 0,
            'fallback_usage': 0
        }
        
        # Reset dependency stats if available
        if hasattr(self.suburb_geocoder, 'reset_stats'):
            self.suburb_geocoder.reset_stats()
    
    def validate_generated_addresses(self, addresses: pd.DataFrame) -> Dict[str, Any]:
        """
        Validate a set of generated addresses
        
        Args:
            addresses: DataFrame of generated addresses
            
        Returns:
            Validation results
        """
        if addresses.empty:
            return {'valid': False, 'error': 'No addresses to validate'}
        
        validation_results = {
            'total_addresses': len(addresses),
            'valid_addresses': 0,
            'invalid_addresses': 0,
            'warnings': [],
            'errors': []
        }
        
        for i, row in addresses.iterrows():
            try:
                address_dict = row.to_dict()
                validation = self.address_assembler.validate_assembled_address(address_dict)
                
                if validation['valid']:
                    validation_results['valid_addresses'] += 1
                else:
                    validation_results['invalid_addresses'] += 1
                    validation_results['errors'].extend([f"Row {i}: {error}" for error in validation['errors']])
                
                validation_results['warnings'].extend([f"Row {i}: {warning}" for warning in validation['warnings']])
                
            except Exception as e:
                validation_results['invalid_addresses'] += 1
                validation_results['errors'].append(f"Row {i}: Validation failed - {e}")
        
        validation_results['validation_success_rate'] = (
            validation_results['valid_addresses'] / validation_results['total_addresses']
        ) * 100
        
        return validation_results
    
    def get_data_summary(self) -> Dict[str, Any]:
        """Get summary of available data"""
        if not self._data_loaded:
            return {'error': 'No data loaded'}
        
        return self.data_processor.get_data_summary()
    
    def get_available_presets(self) -> Dict[str, str]:
        """Get available distribution presets"""
        return self.distribution_manager.get_available_presets()
    
    def create_preset_config(self, preset_name: str, count: int, random_seed: Optional[int] = None) -> AddressGenerationConfig:
        """
        Create configuration from a preset
        
        Args:
            preset_name: Name of the preset to use
            count: Number of addresses to generate
            random_seed: Optional random seed
            
        Returns:
            Address generation configuration
        """
        config = self.distribution_manager.get_preset_distribution(preset_name)
        config.count = count
        config.random_seed = random_seed
        return config
