"""
Configuration settings for SA Mock Address Generator
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Mapbox API Configuration
MAPBOX_ACCESS_TOKEN = os.getenv('MAPBOX_ACCESS_TOKEN', '')
MAPBOX_API_KEY = os.getenv('MAPBOX_API_KEY', MAPBOX_ACCESS_TOKEN)  # Support both variable names

# Address Generation Configuration
MAX_VALIDATION_RETRIES = 3  # Maximum number of retries for API calls

# Default Distribution Weights
DEFAULT_REMOTENESS_WEIGHTS = {
    'Major Cities of Australia': 0.4,      # Higher weight for cities like Adelaide
    'Inner Regional Australia': 0.25,      # Medium weight 
    'Outer Regional Australia': 0.20,      # Medium-low weight (Whyalla, Port Augusta)
    'Remote Australia': 0.10,              # Low weight (Port Lincoln)
    'Very Remote Australia': 0.05,         # Very low weight
    'Not Applicable': 0.0                  # Skip these areas
}

DEFAULT_SOCIOECONOMIC_WEIGHTS = {
    0: 0.05,  # Very low socio-economic status
    1: 0.10,  # Low socio-economic status
    2: 0.20,  # Below average socio-economic status
    3: 0.25,  # Average socio-economic status
    4: 0.25,  # Above average socio-economic status
    5: 0.15   # High socio-economic status
}
