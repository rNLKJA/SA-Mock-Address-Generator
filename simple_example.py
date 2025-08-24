#!/usr/bin/env python3
"""
Simple Example: SA Mock Address Generator

This script demonstrates how to use the SA Address Generator with custom
distribution parameters for remoteness and socio-economic index.

To run this example:
1. Install dependencies: pip install -r requirements.txt
2. Set up Mapbox API key (optional): echo "MAPBOX_API_KEY=your_token" > .env
3. Run: python simple_example.py
"""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the main functions
from api import generate_sa_addresses, lookup_sa_address, get_available_presets


def main():
    print("SA Mock Address Generator - Simple Example")
    print("=" * 50)
    
    # Show available presets
    print("\n1. Available Distribution Presets:")
    print("-" * 30)
    presets = get_available_presets()
    for name, description in presets.items():
        print(f"  {name:<15} - {description}")
    
    # Example 1: Generate addresses with default distribution
    print("\n2. Generating 5 addresses with default distribution:")
    print("-" * 50)
    addresses = generate_sa_addresses(count=5)
    print(addresses[['street_number', 'street_name', 'suburb', 'postcode', 'remoteness', 'socio_economic_index']].to_string(index=False))
    
    # Example 2: Generate addresses with city-focused distribution
    print("\n3. Generating 5 addresses with city-focused distribution:")
    print("-" * 50)
    city_addresses = generate_sa_addresses(count=5, preset='city_focused')
    print(city_addresses[['street_number', 'street_name', 'suburb', 'postcode', 'remoteness', 'socio_economic_index']].to_string(index=False))
    
    # Example 3: Generate addresses with custom remoteness weights
    print("\n4. Generating 5 addresses with custom remoteness weights (80% cities, 20% regional):")
    print("-" * 70)
    custom_remoteness = {
        'Major Cities of Australia': 0.8,      # 80% city focus
        'Inner Regional Australia': 0.2,       # 20% regional
        'Outer Regional Australia': 0.0,       # No rural areas
        'Remote Australia': 0.0,               # No remote areas
        'Very Remote Australia': 0.0,          # No very remote areas
        'Not Applicable': 0.0
    }
    custom_addresses = generate_sa_addresses(
        count=5,
        remoteness_weights=custom_remoteness
    )
    print(custom_addresses[['street_number', 'street_name', 'suburb', 'postcode', 'remoteness', 'socio_economic_index']].to_string(index=False))
    
    # Example 4: Generate addresses with custom socio-economic weights
    print("\n5. Generating 5 addresses with high socio-economic focus:")
    print("-" * 50)
    high_socio_weights = {
        0: 0.0,   # No very low areas
        1: 0.0,   # No low areas
        2: 0.1,   # 10% below average
        3: 0.3,   # 30% average
        4: 0.4,   # 40% above average
        5: 0.2    # 20% high areas
    }
    high_socio_addresses = generate_sa_addresses(
        count=5,
        socioeconomic_weights=high_socio_weights
    )
    print(high_socio_addresses[['street_number', 'street_name', 'suburb', 'postcode', 'remoteness', 'socio_economic_index']].to_string(index=False))
    
    # Example 5: Address lookup
    print("\n6. Address Lookup Examples:")
    print("-" * 30)
    
    # Look up Adelaide
    result = lookup_sa_address("Adelaide")
    if result:
        print(f"Adelaide: {result['full_address']} - {result['remoteness']} - SEIFA {result['socio_economic_index']}")
    
    # Look up Whyalla
    result = lookup_sa_address("Whyalla")
    if result:
        print(f"Whyalla: {result['full_address']} - {result['remoteness']} - SEIFA {result['socio_economic_index']}")
    
    # Look up Port Lincoln
    result = lookup_sa_address("Port Lincoln")
    if result:
        print(f"Port Lincoln: {result['full_address']} - {result['remoteness']} - SEIFA {result['socio_economic_index']}")
    
    print("\n" + "=" * 50)
    print("Example completed successfully!")
    print("\nTo customize distribution parameters:")
    print("1. Edit config.py to change default weights")
    print("2. Use custom weights in generate_sa_addresses() calls")
    print("3. Use preset distributions for common patterns")


if __name__ == "__main__":
    main()
