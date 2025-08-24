"""
Dependency injection container following Dependency Inversion Principle

This container manages the creation and wiring of dependencies,
making the system more testable and flexible.
"""
import logging
from typing import Optional, Dict, Any

from ..interfaces.geocoding import SuburbGeocoder, GeocodingProvider, CoordinateCache, FallbackCoordinateProvider
from ..interfaces.data_processing import DataProcessor, DataLoader, DataCleaner, WeightCalculator, SuburbSampler
from ..interfaces.address_generation import AddressGenerator, StreetAddressGenerator, DistributionManager, AddressAssembler

from ..providers.mapbox_geocoder import MapboxGeocodingProvider
from ..providers.coordinate_cache import JsonCoordinateCache
from ..providers.fallback_coordinates import SAFallbackCoordinateProvider
from ..providers.suburb_geocoder_impl import SuburbGeocoderImpl

from ..processors.data_loader import CSVDataLoader
from ..processors.data_cleaner import SADataCleaner
from ..processors.suburb_sampler import WeightCalculatorImpl, SuburbSamplerImpl
from ..processors.data_processor_impl import DataProcessorImpl

from ..generators.street_address_generator import AustralianStreetAddressGenerator
from ..generators.distribution_manager import SADistributionManager
from ..generators.address_assembler import SAAddressAssembler
from ..generators.address_generator_impl import SAAddressGeneratorImpl

from ..config import MAPBOX_ACCESS_TOKEN, MAPBOX_API_KEY

logger = logging.getLogger(__name__)


class DependencyContainer:
    """
    Dependency injection container for managing application dependencies
    
    Follows the Dependency Inversion Principle by providing configured
    implementations of interfaces.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize dependency container
        
        Args:
            config: Optional configuration override dictionary
        """
        self.config = config or {}
        self._instances: Dict[str, Any] = {}
        self._setup_logging()
    
    def _setup_logging(self):
        """Setup logging configuration"""
        log_level = self.config.get('log_level', 'INFO')
        logging.basicConfig(
            level=getattr(logging, log_level.upper()),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    def get_geocoding_provider(self) -> Optional[GeocodingProvider]:
        """
        Get configured geocoding provider (Mapbox)
        
        Returns:
            Configured geocoding provider or None if no API key
        """
        if 'geocoding_provider' not in self._instances:
            # Get Mapbox API key from config or environment
            api_key = (self.config.get('mapbox_api_key') or 
                      MAPBOX_API_KEY or 
                      MAPBOX_ACCESS_TOKEN)
            
            if api_key:
                try:
                    provider = MapboxGeocodingProvider(api_key)
                    if provider.is_available():
                        self._instances['geocoding_provider'] = provider
                        logger.info("Mapbox geocoding provider initialized successfully")
                    else:
                        logger.warning("Mapbox geocoding provider not available")
                        self._instances['geocoding_provider'] = None
                except Exception as e:
                    logger.error(f"Failed to initialize Mapbox provider: {e}")
                    self._instances['geocoding_provider'] = None
            else:
                logger.warning("No Mapbox API key found - geocoding will use fallback only")
                self._instances['geocoding_provider'] = None
        
        return self._instances['geocoding_provider']
    
    def get_coordinate_cache(self) -> CoordinateCache:
        """Get coordinate cache implementation"""
        if 'coordinate_cache' not in self._instances:
            cache_file = self.config.get('cache_file')
            self._instances['coordinate_cache'] = JsonCoordinateCache(cache_file)
            logger.debug("JSON coordinate cache initialized")
        
        return self._instances['coordinate_cache']
    
    def get_fallback_provider(self) -> FallbackCoordinateProvider:
        """Get fallback coordinate provider"""
        if 'fallback_provider' not in self._instances:
            self._instances['fallback_provider'] = SAFallbackCoordinateProvider()
            logger.debug("SA fallback coordinate provider initialized")
        
        return self._instances['fallback_provider']
    
    def get_suburb_geocoder(self) -> SuburbGeocoder:
        """
        Get configured suburb geocoder with all dependencies injected
        
        Returns:
            Fully configured suburb geocoder
        """
        if 'suburb_geocoder' not in self._instances:
            geocoding_provider = self.get_geocoding_provider()
            coordinate_cache = self.get_coordinate_cache()
            fallback_provider = self.get_fallback_provider()
            
            self._instances['suburb_geocoder'] = SuburbGeocoderImpl(
                geocoding_provider=geocoding_provider,
                coordinate_cache=coordinate_cache,
                fallback_provider=fallback_provider
            )
            logger.debug("Suburb geocoder initialized with dependencies")
        
        return self._instances['suburb_geocoder']
    
    def get_data_loader(self) -> DataLoader:
        """Get data loader implementation"""
        if 'data_loader' not in self._instances:
            default_path = self.config.get('data_path')
            self._instances['data_loader'] = CSVDataLoader(default_path)
            logger.debug("CSV data loader initialized")
        
        return self._instances['data_loader']
    
    def get_data_cleaner(self) -> DataCleaner:
        """Get data cleaner implementation"""
        if 'data_cleaner' not in self._instances:
            self._instances['data_cleaner'] = SADataCleaner()
            logger.debug("SA data cleaner initialized")
        
        return self._instances['data_cleaner']
    
    def get_weight_calculator(self) -> WeightCalculator:
        """Get weight calculator implementation"""
        if 'weight_calculator' not in self._instances:
            self._instances['weight_calculator'] = WeightCalculatorImpl()
            logger.debug("Weight calculator initialized")
        
        return self._instances['weight_calculator']
    
    def get_suburb_sampler(self) -> SuburbSampler:
        """Get suburb sampler implementation"""
        if 'suburb_sampler' not in self._instances:
            self._instances['suburb_sampler'] = SuburbSamplerImpl()
            logger.debug("Suburb sampler initialized")
        
        return self._instances['suburb_sampler']
    
    def get_data_processor(self) -> DataProcessor:
        """
        Get configured data processor with all dependencies injected
        
        Returns:
            Fully configured data processor
        """
        if 'data_processor' not in self._instances:
            data_loader = self.get_data_loader()
            data_cleaner = self.get_data_cleaner()
            weight_calculator = self.get_weight_calculator()
            suburb_sampler = self.get_suburb_sampler()
            
            self._instances['data_processor'] = DataProcessorImpl(
                data_loader=data_loader,
                data_cleaner=data_cleaner,
                weight_calculator=weight_calculator,
                suburb_sampler=suburb_sampler
            )
            logger.debug("Data processor initialized with dependencies")
        
        return self._instances['data_processor']
    
    def get_street_address_generator(self) -> StreetAddressGenerator:
        """Get street address generator implementation"""
        if 'street_generator' not in self._instances:
            custom_names = self.config.get('custom_street_names')
            self._instances['street_generator'] = AustralianStreetAddressGenerator(custom_names)
            logger.debug("Street address generator initialized")
        
        return self._instances['street_generator']
    
    def get_distribution_manager(self) -> DistributionManager:
        """Get distribution manager implementation"""
        if 'distribution_manager' not in self._instances:
            self._instances['distribution_manager'] = SADistributionManager()
            logger.debug("Distribution manager initialized")
        
        return self._instances['distribution_manager']
    
    def get_address_assembler(self) -> AddressAssembler:
        """Get address assembler implementation"""
        if 'address_assembler' not in self._instances:
            self._instances['address_assembler'] = SAAddressAssembler()
            logger.debug("Address assembler initialized")
        
        return self._instances['address_assembler']
    
    def get_address_generator(self) -> AddressGenerator:
        """
        Get configured address generator with all dependencies injected
        
        Returns:
            Fully configured address generator
        """
        if 'address_generator' not in self._instances:
            data_processor = self.get_data_processor()
            suburb_geocoder = self.get_suburb_geocoder()
            street_generator = self.get_street_address_generator()
            distribution_manager = self.get_distribution_manager()
            address_assembler = self.get_address_assembler()
            
            default_data_source = self.config.get('default_data_source', 'sa_suburbs_data.csv')
            
            self._instances['address_generator'] = SAAddressGeneratorImpl(
                data_processor=data_processor,
                suburb_geocoder=suburb_geocoder,
                street_generator=street_generator,
                distribution_manager=distribution_manager,
                address_assembler=address_assembler,
                default_data_source=default_data_source
            )
            logger.debug("Address generator initialized with dependencies")
        
        return self._instances['address_generator']
    
    def configure(self, **kwargs) -> 'DependencyContainer':
        """
        Configure the container with additional settings
        
        Args:
            **kwargs: Configuration options
            
        Returns:
            Self for method chaining
        """
        self.config.update(kwargs)
        # Clear relevant cached instances so they get recreated with new config
        affected_keys = ['geocoding_provider', 'coordinate_cache', 'data_loader']
        for key in affected_keys:
            if key in self._instances:
                del self._instances[key]
        
        return self
    
    def get_container_info(self) -> Dict[str, Any]:
        """Get information about the container state"""
        geocoding_provider = self.get_geocoding_provider()
        
        return {
            'config': self.config,
            'initialized_instances': list(self._instances.keys()),
            'geocoding_available': geocoding_provider is not None and geocoding_provider.is_available(),
            'geocoding_provider_type': type(geocoding_provider).__name__ if geocoding_provider else 'None',
            'cache_type': type(self.get_coordinate_cache()).__name__,
            'fallback_provider_type': type(self.get_fallback_provider()).__name__
        }
    
    def reset(self) -> None:
        """Reset the container, clearing all cached instances"""
        self._instances.clear()
        logger.info("Dependency container reset")


# Global container instance for convenience
_default_container: Optional[DependencyContainer] = None


def get_default_container() -> DependencyContainer:
    """
    Get the default dependency container instance
    
    Returns:
        Default container instance
    """
    global _default_container
    if _default_container is None:
        _default_container = DependencyContainer()
    return _default_container


def configure_default_container(**kwargs) -> DependencyContainer:
    """
    Configure the default container
    
    Args:
        **kwargs: Configuration options
        
    Returns:
        Configured default container
    """
    return get_default_container().configure(**kwargs)


def reset_default_container() -> None:
    """Reset the default container"""
    global _default_container
    if _default_container:
        _default_container.reset()
    _default_container = None
