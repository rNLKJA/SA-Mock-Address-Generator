#!/usr/bin/env python3
"""
SA Address Lookup Tool
Simple command-line tool for looking up South Australian address details
"""
import argparse
import sys
from . import lookup_sa_address


def main():
    parser = argparse.ArgumentParser(
        description="Look up South Australian address details",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python lookup_address.py "Adelaide"
  python lookup_address.py "5000"
  python lookup_address.py "Whyalla 5600"
  python lookup_address.py "Port Lincoln"
  python lookup_address.py "Mount Gambier"
  
Search Tips:
  - Use suburb names (e.g., "Adelaide", "Whyalla")
  - Use postcodes (e.g., "5000", "5600")
  - Combine suburb and postcode (e.g., "Adelaide 5000")
  - Partial matches are supported (e.g., "Mount" will find "Mount Gambier")
        """
    )
    
    parser.add_argument('address', help='Address to lookup (suburb, postcode, or combination)')
    parser.add_argument('--json', action='store_true', help='Output results in JSON format')
    
    args = parser.parse_args()
    
    try:
        result = lookup_sa_address(args.address)
        
        if result:
            if args.json:
                import json
                print(json.dumps(result, indent=2))
            else:
                print(f"Address Lookup Results for: '{args.address}'")
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
            print(f"No results found for: '{args.address}'")
            print("\nTry searching with:")
            print("  - Suburb name (e.g., 'Adelaide')")
            print("  - Postcode (e.g., '5000')")
            print("  - Suburb and postcode (e.g., 'Whyalla 5600')")
            print("  - Partial suburb name (e.g., 'Mount' for Mount Gambier)")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
