"""
SA Mock Address Generator

A Python package for generating realistic South Australian addresses with 
customizable distribution parameters based on remoteness and socio-economic data.

Simple, maintainable implementation focused on core functionality.

Author: rNLKJA
"""

# Import the simple generator functions from demo folder
from .simple_generator import (
    generate_address,
    generate_addresses,
    lookup_address,
    get_available_presets,
    export_to_csv
)

# Configuration
from .config import (
    DEFAULT_REMOTENESS_WEIGHTS, 
    DEFAULT_SOCIOECONOMIC_WEIGHTS,
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_API_KEY
)

__version__ = "2.1.0"
__author__ = "rNLKJA"
__email__ = "huang@rin.contact"
__description__ = "Generate realistic South Australian addresses with customizable distribution parameters"

# Main API exports
__all__ = [
    # Main functions
    "generate_address",
    "generate_addresses", 
    "lookup_address",
    "get_available_presets",
    "export_to_csv",
    
    # Configuration
    "DEFAULT_REMOTENESS_WEIGHTS",
    "DEFAULT_SOCIOECONOMIC_WEIGHTS",
    "MAPBOX_ACCESS_TOKEN",
    "MAPBOX_API_KEY"
]
