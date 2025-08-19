#!/usr/bin/env python3
"""
Simple CLI for SA Address Generation
"""
import argparse
import sys
import json
from sa_mock_address_generator import generate_sa_addresses, SAAddressAPI, lookup_sa_address
from sa_mock_address_generator import DEFAULT_REMOTENESS_WEIGHTS, DEFAULT_SOCIOECONOMIC_WEIGHTS


def main():
    parser = argparse.ArgumentParser(
        description="Generate South Australian addresses with custom distribution parameters",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_addresses.py 100 --output addresses.csv
  python generate_addresses.py 50 --preset city_focused
  python generate_addresses.py 20 --remoteness major_cities --seed 42
  python generate_addresses.py 30 --socio-economic high
  python generate_addresses.py 10 --remoteness remote --show-summary
  
  # Address Lookup Examples:
  python generate_addresses.py --lookup "Adelaide"
  python generate_addresses.py --lookup "5000"
  python generate_addresses.py --lookup "Whyalla 5600"
  python generate_addresses.py -l "Port Lincoln"
  
Presets:
  city_focused     - Focus on Adelaide and major cities
  regional_focused - Focus on regional towns like Whyalla
  remote_focused   - Include more remote areas
  high_socio       - Higher socioeconomic areas
  low_socio        - Lower socioeconomic areas

Remoteness Levels:
  major_cities     - Adelaide, major urban centers
  inner_regional   - Regional cities and towns
  outer_regional   - Rural towns and communities
  remote           - Remote areas like Port Lincoln
  very_remote      - Very remote areas

Socio-Economic Levels:
  very_low (0)     - Very low socio-economic status
  low (1)          - Low socio-economic status
  below_avg (2)    - Below average socio-economic status
  average (3)      - Average socio-economic status
  above_avg (4)    - Above average socio-economic status
  high (5)         - High socio-economic status
        """
    )
    
    parser.add_argument('count', type=int, nargs='?', help='Number of addresses to generate')
    parser.add_argument('--output', '-o', help='Output CSV filename')
    parser.add_argument('--preset', choices=['city_focused', 'regional_focused', 'remote_focused', 'high_socio', 'low_socio'], 
                       help='Use predefined distribution')
    parser.add_argument('--remoteness', choices=['major_cities', 'inner_regional', 'outer_regional', 'remote', 'very_remote'],
                       help='Focus on specific remoteness level')
    parser.add_argument('--socio-economic', choices=['very_low', 'low', 'below_avg', 'average', 'above_avg', 'high'],
                       help='Focus on specific socio-economic level')
    parser.add_argument('--seed', type=int, help='Random seed for reproducible results')
    parser.add_argument('--show-summary', action='store_true', help='Show distribution summary')
    parser.add_argument('--lookup', '-l', type=str, help='Look up address details (e.g., "Adelaide", "5000", "Whyalla 5600")')
    
    args = parser.parse_args()
    
    try:
        # Handle address lookup
        if args.lookup:
            result = lookup_sa_address(args.lookup)
            if result:
                print(f"Address Lookup Results for: '{args.lookup}'")
                print("=" * 50)
                print(f"Full Address: {result['full_address']}")
                print(f"Suburb: {result['suburb']}")
                print(f"State: {result['state']}")
                print(f"Postcode: {result['postcode']}")
                print(f"Council: {result['council']}")
                print(f"Remoteness: {result['remoteness']}")
                print(f"Socio-Economic Index: {result['socio_economic_index']}")
                if result['latitude'] and result['longitude']:
                    print(f"Coordinates: ({result['latitude']}, {result['longitude']})")
                else:
                    print("Coordinates: Not available")
            else:
                print(f"No results found for: '{args.lookup}'")
                print("Try searching with:")
                print("  - Suburb name (e.g., 'Adelaide')")
                print("  - Postcode (e.g., '5000')")
                print("  - Suburb and postcode (e.g., 'Whyalla 5600')")
            return
        
        # Validate count argument for address generation
        if args.count is None:
            parser.error("count is required for address generation (use --lookup for address lookup)")
        # Prepare custom weights based on arguments
        remoteness_weights = None
        socioeconomic_weights = None
        
        # Handle remoteness focus
        if args.remoteness:
            remoteness_weights = DEFAULT_REMOTENESS_WEIGHTS.copy()
            # Zero out all weights then set the selected one high
            for key in remoteness_weights:
                remoteness_weights[key] = 0.0
            
            remoteness_map = {
                'major_cities': 'Major Cities of Australia',
                'inner_regional': 'Inner Regional Australia',
                'outer_regional': 'Outer Regional Australia',
                'remote': 'Remote Australia',
                'very_remote': 'Very Remote Australia'
            }
            
            if args.remoteness in remoteness_map:
                remoteness_weights[remoteness_map[args.remoteness]] = 1.0
        
        # Handle socio-economic focus
        if hasattr(args, 'socio_economic') and args.socio_economic:
            socioeconomic_weights = DEFAULT_SOCIOECONOMIC_WEIGHTS.copy()
            # Zero out all weights then set the selected one high
            for key in socioeconomic_weights:
                socioeconomic_weights[key] = 0.0
            
            socio_map = {
                'very_low': 0,
                'low': 1,
                'below_avg': 2,
                'average': 3,
                'above_avg': 4,
                'high': 5
            }
            
            if args.socio_economic in socio_map:
                socioeconomic_weights[socio_map[args.socio_economic]] = 1.0
        
        # Generate addresses
        addresses = generate_sa_addresses(
            count=args.count,
            preset=args.preset if not (args.remoteness or (hasattr(args, 'socio_economic') and args.socio_economic)) else None,
            remoteness_weights=remoteness_weights,
            socioeconomic_weights=socioeconomic_weights,
            output_file=args.output,
            random_seed=args.seed
        )
        
        print(f"Generated {len(addresses)} SA addresses")
        
        # Show sample
        print("\nSample addresses:")
        for i, row in addresses.head(5).iterrows():
            print(f"  {i+1}. {row['street_address']}, {row['suburb']} {row['postcode']}")
            print(f"     Coordinates: ({row['latitude']:.4f}, {row['longitude']:.4f})")
            print(f"     Council: {row['council']}")
        
        if len(addresses) > 5:
            print(f"  ... and {len(addresses) - 5} more")
        
        # Show summary if requested
        if args.show_summary:
            api = SAAddressAPI()
            summary = api.get_distribution_summary(addresses)
            
            print(f"\nDistribution Summary:")
            print(f"Unique suburbs: {summary['unique_suburbs']}")
            print(f"Remoteness distribution:")
            for level, count in summary['remoteness_distribution'].items():
                pct = (count / summary['total_count']) * 100
                print(f"  {level}: {count} ({pct:.1f}%)")
        
        if args.output:
            print(f"\nSaved to: {args.output}")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
