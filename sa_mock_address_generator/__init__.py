"""
SA Mock Address Generator

A Python package for generating realistic South Australian addresses with 
customizable distribution parameters based on remoteness and socio-economic data.

Author: rNLKJA
"""

from .sa_address_api import generate_sa_addresses, lookup_sa_address, SAAddressAPI
from .suburb_geocoder import SuburbGeocoder
from .data_processor import SADataProcessor
from .config import (
    DEFAULT_REMOTENESS_WEIGHTS, 
    DEFAULT_SOCIOECONOMIC_WEIGHTS,
    GOOGLE_API_KEY,
    GOOGLE_MAPS_API_KEY
)

__version__ = "1.0.0"
__author__ = "rNLKJA"
__email__ = "contact@rnlkja.com"
__description__ = "Generate realistic South Australian addresses with customizable distribution parameters"

# Main API exports
__all__ = [
    "generate_sa_addresses",
    "lookup_sa_address", 
    "SAAddressAPI",
    "SuburbGeocoder",
    "SADataProcessor",
    "DEFAULT_REMOTENESS_WEIGHTS",
    "DEFAULT_SOCIOECONOMIC_WEIGHTS"
]
