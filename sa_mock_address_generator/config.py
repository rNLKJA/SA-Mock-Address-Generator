"""
Configuration settings for SA Mock Address Generator
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Google Maps API Configuration - get from environment variable
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', GOOGLE_API_KEY)  # Support both variable names

# Address Generation Configuration
MAX_VALIDATION_RETRIES = int(os.getenv('MAX_VALIDATION_RETRIES', '3'))

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
