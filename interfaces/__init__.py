"""
Interfaces package for SA Mock Address Generator

Contains all abstract interfaces following SOLID principles.
"""

from .geocoding import (
    GeocodingProvider,
    CoordinateCache,
    FallbackCoordinateProvider,
    SuburbGeocoder
)

from .data_processing import (
    DataLoader,
    DataCleaner,
    SuburbFilter,
    WeightCalculator,
    SuburbSampler,
    DataProcessor
)

from .address_generation import (
    AddressGenerationConfig,
    StreetAddressGenerator,
    DistributionManager,
    AddressAssembler,
    AddressExporter,
    AddressAnalyzer,
    AddressGenerator,
    AddressLookup
)

__all__ = [
    # Geocoding interfaces
    "GeocodingProvider",
    "CoordinateCache", 
    "FallbackCoordinateProvider",
    "SuburbGeocoder",
    
    # Data processing interfaces
    "DataLoader",
    "DataCleaner",
    "SuburbFilter", 
    "WeightCalculator",
    "SuburbSampler",
    "DataProcessor",
    
    # Address generation interfaces
    "AddressGenerationConfig",
    "StreetAddressGenerator",
    "DistributionManager",
    "AddressAssembler",
    "AddressExporter",
    "AddressAnalyzer", 
    "AddressGenerator",
    "AddressLookup"
]
