#!/usr/bin/env python3
"""
Simple SA Address Generator

A simple script to generate South Australian addresses based on 
remoteness and socio-economic parameters.

Usage:
    python simple_generator.py [count] [options]
    
Examples:
    python simple_generator.py 10                    # Generate 10 addresses
    python simple_generator.py 5 --remoteness city   # City-focused
    python simple_generator.py 5 --socio high        # High socio-economic
    python simple_generator.py --lookup "Adelaide"   # Look up address
    python simple_generator.py 10 --output results.csv  # Export to CSV
"""

import sys
import argparse
import random
import pandas as pd
import os
from typing import Dict, List, Optional

# Simple address data with geo coordinates
SA_SUBURBS = [
    {"suburb": "Adelaide", "postcode": "5000", "remoteness": "Major Cities of Australia", "socio_economic": 4, "latitude": -34.9285, "longitude": 138.6007},
    {"suburb": "North Adelaide", "postcode": "5006", "remoteness": "Major Cities of Australia", "socio_economic": 5, "latitude": -34.9089, "longitude": 138.5994},
    {"suburb": "Whyalla", "postcode": "5600", "remoteness": "Inner Regional Australia", "socio_economic": 2, "latitude": -33.0327, "longitude": 137.5648},
    {"suburb": "Mount Gambier", "postcode": "5290", "remoteness": "Inner Regional Australia", "socio_economic": 3, "latitude": -37.8312, "longitude": 140.7792},
    {"suburb": "Port Lincoln", "postcode": "5606", "remoteness": "Remote Australia", "socio_economic": 2, "latitude": -34.7261, "longitude": 135.8575},
    {"suburb": "Port Augusta", "postcode": "5700", "remoteness": "Outer Regional Australia", "socio_economic": 1, "latitude": -32.4924, "longitude": 137.7728},
    {"suburb": "Murray Bridge", "postcode": "5253", "remoteness": "Inner Regional Australia", "socio_economic": 3, "latitude": -35.1197, "longitude": 139.2734},
    {"suburb": "Victor Harbor", "postcode": "5211", "remoteness": "Inner Regional Australia", "socio_economic": 4, "latitude": -35.5500, "longitude": 138.6167},
    {"suburb": "Coober Pedy", "postcode": "5723", "remoteness": "Very Remote Australia", "socio_economic": 1, "latitude": -29.0139, "longitude": 134.7544},
    {"suburb": "Roxby Downs", "postcode": "5725", "remoteness": "Very Remote Australia", "socio_economic": 2, "latitude": -30.5631, "longitude": 136.8953},
]

STREET_NAMES = [
    "Main Street", "High Street", "King Street", "Queen Street", "George Street",
    "William Street", "Elizabeth Street", "Victoria Street", "Albert Street",
    "Church Street", "School Street", "Park Street", "Hill Street", "River Street",
    "Ocean Street", "Mountain Street", "Forest Street", "Garden Street"
]

STREET_TYPES = ["Street", "Road", "Avenue", "Drive", "Lane", "Court", "Place", "Way"]

# Default distribution weights
DEFAULT_REMOTENESS_WEIGHTS = {
    "Major Cities of Australia": 0.4,
    "Inner Regional Australia": 0.25,
    "Outer Regional Australia": 0.20,
    "Remote Australia": 0.10,
    "Very Remote Australia": 0.05
}

DEFAULT_SOCIO_WEIGHTS = {
    1: 0.10,  # Low socio-economic
    2: 0.20,  # Below average
    3: 0.25,  # Average
    4: 0.25,  # Above average
    5: 0.20   # High socio-economic
}

def generate_address(remoteness_weights: Optional[Dict[str, float]] = None, 
                    socio_weights: Optional[Dict[int, float]] = None,
                    random_seed: Optional[int] = None) -> Dict:
    """Generate a single address based on distribution weights."""
    if random_seed:
        random.seed(random_seed)
    
    # Use default weights if not provided
    remoteness_weights = remoteness_weights or DEFAULT_REMOTENESS_WEIGHTS
    socio_weights = socio_weights or DEFAULT_SOCIO_WEIGHTS
    
    # Select suburb based on remoteness weights
    available_suburbs = [s for s in SA_SUBURBS if s["remoteness"] in remoteness_weights]
    if not available_suburbs:
        available_suburbs = SA_SUBURBS
    
    # Weighted selection
    weights = [remoteness_weights.get(s["remoteness"], 0.1) for s in available_suburbs]
    suburb = random.choices(available_suburbs, weights=weights)[0]
    
    # Generate street address
    street_number = random.randint(1, 999)
    street_name = random.choice(STREET_NAMES)
    street_type = random.choice(STREET_TYPES)
    
    return {
        "street_number": street_number,
        "street_name": street_name,
        "street_type": street_type,
        "suburb": suburb["suburb"],
        "state": "SA",
        "postcode": suburb["postcode"],
        "remoteness": suburb["remoteness"],
        "socio_economic_index": suburb["socio_economic"],
        "latitude": suburb["latitude"],
        "longitude": suburb["longitude"],
        "full_address": f"{street_number} {street_name}, {suburb['suburb']} {suburb['postcode']}"
    }

def generate_addresses(count: int, 
                      remoteness_weights: Optional[Dict[str, float]] = None,
                      socio_weights: Optional[Dict[int, float]] = None,
                      random_seed: Optional[int] = None) -> pd.DataFrame:
    """Generate multiple addresses."""
    addresses = []
    for i in range(count):
        # Use different seed for each address if base seed provided
        seed = random_seed + i if random_seed else None
        address = generate_address(remoteness_weights, socio_weights, seed)
        addresses.append(address)
    
    return pd.DataFrame(addresses)

def lookup_address(query: str) -> Optional[Dict]:
    """Look up address details by suburb name or postcode."""
    query = query.lower().strip()
    
    for suburb in SA_SUBURBS:
        if (query in suburb["suburb"].lower() or 
            query == str(suburb["postcode"]).lower()):
            return {
                "full_address": f"Sample Address, {suburb['suburb']} {suburb['postcode']}",
                "suburb": suburb["suburb"],
                "state": "SA",
                "postcode": suburb["postcode"],
                "remoteness": suburb["remoteness"],
                "socio_economic_index": suburb["socio_economic"],
                "latitude": suburb["latitude"],
                "longitude": suburb["longitude"]
            }
    
    return None

def get_available_presets() -> Dict[str, str]:
    """Get available distribution presets."""
    return {
        "city_focused": "Focus on Adelaide and major cities",
        "regional_focused": "Focus on regional towns",
        "remote_focused": "Include more remote areas",
        "high_socio": "Higher socioeconomic areas",
        "low_socio": "Lower socioeconomic areas"
    }

def export_to_csv(addresses: pd.DataFrame, filename: str) -> str:
    """Export addresses to CSV file."""
    # Create demo directory if it doesn't exist
    demo_dir = "demo"
    if not os.path.exists(demo_dir):
        os.makedirs(demo_dir)
    
    # Create full path for the CSV file
    filepath = os.path.join(demo_dir, filename)
    
    # Export to CSV
    addresses.to_csv(filepath, index=False)
    print(f"Exported {len(addresses)} addresses to {filepath}")
    return filepath

def main():
    parser = argparse.ArgumentParser(
        description="Generate South Australian addresses with custom distribution parameters",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python simple_generator.py 10                    # Generate 10 addresses
  python simple_generator.py 5 --remoteness city   # City-focused
  python simple_generator.py 5 --socio high        # High socio-economic
  python simple_generator.py --lookup "Adelaide"   # Look up address
  python simple_generator.py --lookup "5000"       # Look up by postcode
  python simple_generator.py 10 --output results.csv  # Export to CSV
        """
    )
    
    parser.add_argument('count', type=int, nargs='?', help='Number of addresses to generate')
    parser.add_argument('--remoteness', choices=['city', 'regional', 'remote'], 
                       help='Focus on specific remoteness level')
    parser.add_argument('--socio', choices=['low', 'high'], 
                       help='Focus on specific socio-economic level')
    parser.add_argument('--seed', type=int, help='Random seed for reproducible results')
    parser.add_argument('--lookup', type=str, help='Look up address details')
    parser.add_argument('--presets', action='store_true', help='Show available presets')
    parser.add_argument('--output', type=str, help='Export results to CSV file (saved in demo folder)')
    
    args = parser.parse_args()
    
    try:
        # Show available presets
        if args.presets:
            presets = get_available_presets()
            print("Available Distribution Presets:")
            print("=" * 40)
            for name, description in presets.items():
                print(f"  {name:<15} - {description}")
            return
        
        # Handle address lookup
        if args.lookup:
            result = lookup_address(args.lookup)
            if result:
                print(f"Address Lookup Results for: '{args.lookup}'")
                print("=" * 50)
                print(f"Full Address: {result['full_address']}")
                print(f"Suburb: {result['suburb']}")
                print(f"State: {result['state']}")
                print(f"Postcode: {result['postcode']}")
                print(f"Remoteness: {result['remoteness']}")
                print(f"Socio-Economic Index: {result['socio_economic_index']}")
                print(f"Coordinates: {result['latitude']}, {result['longitude']}")
            else:
                print(f"No results found for: '{args.lookup}'")
                print("Try searching with:")
                print("  - Suburb name (e.g., 'Adelaide')")
                print("  - Postcode (e.g., '5000')")
            return
        
        # Validate count argument
        if args.count is None:
            parser.error("count is required for address generation (use --lookup for address lookup)")
        
        if args.count and args.count <= 0:
            print("Error: Count must be positive")
            sys.exit(1)
        
        # Prepare custom weights based on arguments
        remoteness_weights = None
        socio_weights = None
        
        if args.remoteness == 'city':
            remoteness_weights = {
                "Major Cities of Australia": 0.8,
                "Inner Regional Australia": 0.2,
                "Outer Regional Australia": 0.0,
                "Remote Australia": 0.0,
                "Very Remote Australia": 0.0
            }
        elif args.remoteness == 'regional':
            remoteness_weights = {
                "Major Cities of Australia": 0.1,
                "Inner Regional Australia": 0.5,
                "Outer Regional Australia": 0.3,
                "Remote Australia": 0.1,
                "Very Remote Australia": 0.0
            }
        elif args.remoteness == 'remote':
            remoteness_weights = {
                "Major Cities of Australia": 0.0,
                "Inner Regional Australia": 0.2,
                "Outer Regional Australia": 0.3,
                "Remote Australia": 0.3,
                "Very Remote Australia": 0.2
            }
        
        if args.socio == 'high':
            socio_weights = {
                1: 0.0,   # No low socio-economic
                2: 0.1,   # 10% below average
                3: 0.3,   # 30% average
                4: 0.4,   # 40% above average
                5: 0.2    # 20% high
            }
        elif args.socio == 'low':
            socio_weights = {
                1: 0.3,   # 30% low
                2: 0.4,   # 40% below average
                3: 0.2,   # 20% average
                4: 0.1,   # 10% above average
                5: 0.0    # No high socio-economic
            }
        
        # Generate addresses
        count = args.count  # We know it's not None at this point
        print(f"Generating {count} South Australian addresses...")
        addresses = generate_addresses(
            count=int(count),
            remoteness_weights=remoteness_weights,
            socio_weights=socio_weights,
            random_seed=args.seed
        )
        
        # Export to CSV if requested
        if args.output:
            export_to_csv(addresses, args.output)
        
        # Display results
        print(f"\nGenerated {len(addresses)} addresses:")
        print("=" * 50)
        print(addresses[['street_number', 'street_name', 'suburb', 'postcode', 'remoteness', 'socio_economic_index', 'latitude', 'longitude']].to_string(index=False))
        
        # Show distribution summary
        print(f"\nDistribution Summary:")
        print("=" * 30)
        remoteness_dist = addresses['remoteness'].value_counts()
        print("Remoteness Distribution:")
        for level, count in remoteness_dist.items():
            percentage = (count / len(addresses)) * 100
            print(f"  {level:<25} {count:>3} ({percentage:>5.1f}%)")
        
        socio_dist = addresses['socio_economic_index'].value_counts().sort_index()
        print("\nSocio-Economic Distribution:")
        for level, count in socio_dist.items():
            percentage = (count / len(addresses)) * 100
            print(f"  Level {level:<2} {'(High)' if level == 5 else '(Low)' if level == 1 else '':<8} {count:>3} ({percentage:>5.1f}%)")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
