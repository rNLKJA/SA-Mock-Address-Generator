"""
SA Mock Address Generator

A Python package for generating realistic South Australian addresses with 
customizable distribution parameters based on remoteness and socio-economic data.

Now built with SOLID principles, dependency injection, and Mapbox geocoding.

Author: rNLKJA
"""

# Modern API with SOLID principles
from .api import (
    SAAddressAPI, 
    generate_sa_addresses, 
    lookup_sa_address, 
    get_available_presets,
    configure_api
)

# Configuration
from .config import (
    DEFAULT_REMOTENESS_WEIGHTS, 
    DEFAULT_SOCIOECONOMIC_WEIGHTS,
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_API_KEY
)

# Core components for advanced usage
from .core.dependency_container import (
    DependencyContainer,
    get_default_container,
    configure_default_container
)

__version__ = "2.0.0"
__author__ = "rNLKJA"
__email__ = "contact@rnlkja.com"
__description__ = "Generate realistic South Australian addresses with customizable distribution parameters using SOLID principles and Mapbox geocoding"

# Main API exports
__all__ = [
    # Main API
    "SAAddressAPI",
    "generate_sa_addresses",
    "lookup_sa_address", 
    "get_available_presets",
    "configure_api",
    
    # Configuration
    "DEFAULT_REMOTENESS_WEIGHTS",
    "DEFAULT_SOCIOECONOMIC_WEIGHTS",
    "MAPBOX_ACCESS_TOKEN",
    "MAPBOX_API_KEY",
    
    # Advanced usage
    "DependencyContainer",
    "get_default_container",
    "configure_default_container"
]
