#!/usr/bin/env python3
"""
Command Line Interface for SA Address Lookup
Simple CLI for generating and looking up South Australian addresses
"""
import argparse
import json
import sys
from typing import Optional
from sa_address_lookup import SAAddressLookup

# Global variable to track CSV header printing
_csv_header_printed = False


def print_address(address: dict, format_type: str = 'default') -> None:
    """
    Print address information in the specified format
    
    Args:
        address: Address dictionary
        format_type: Output format ('default', 'json', 'csv')
    """
    if format_type == 'json':
        # Convert any numpy/pandas types to native Python types for JSON serialization
        json_address = {}
        for key, value in address.items():
            if hasattr(value, 'item'):  # numpy/pandas scalar
                json_address[key] = value.item()
            else:
                json_address[key] = value
        print(json.dumps(json_address, indent=2))
    elif format_type == 'csv':
        # Print CSV header if this is the first address
        global _csv_header_printed
        if not _csv_header_printed:
            headers = list(address.keys())
            print(','.join(headers))
            _csv_header_printed = True
        
        # Print CSV row
        values = [str(v) if v is not None else '' for v in address.values()]
        print(','.join(f'"{v}"' for v in values))
    else:
        # Default human-readable format
        print(f"Address: {address['full_address']}")
        print(f"Street: {address['street_address']}")
        print(f"Suburb: {address['suburb']}")
        print(f"Postcode: {address['postcode']}")
        print(f"Council: {address['council']}")
        if address['latitude'] and address['longitude']:
            print(f"Coordinates: {address['latitude']}, {address['longitude']}")
        print(f"Remoteness: {address['remoteness_level']}")
        print(f"Socio-economic level: {address['socio_economic_status']}")


def generate_addresses(args) -> None:
    """Generate random addresses based on command line arguments"""
    lookup = SAAddressLookup()
    
    count = args.count
    distribution_type = 'default'
    distribution_value = None
    
    # Determine distribution type and value
    if args.suburb:
        distribution_type = 'suburb'
        distribution_value = args.suburb
    elif args.council:
        distribution_type = 'council'
        distribution_value = args.council
    elif args.remoteness:
        distribution_type = 'remoteness'
        distribution_value = args.remoteness
    elif args.socioeconomic:
        distribution_type = 'socioeconomic'
        distribution_value = str(args.socioeconomic)
    
    print(f"Generating {count} South Australian address{'es' if count > 1 else ''}...")
    if distribution_type != 'default':
        print(f"Filtering by {distribution_type}: {distribution_value}")
    print()
    
    # Generate addresses
    for i in range(count):
        try:
            address = lookup.generate_random_address(
                distribution_type=distribution_type,
                distribution_value=distribution_value
            )
            
            if count > 1 and args.output_format == 'default':
                print(f"=== Address {i + 1} ===")
            
            print_address(address, args.output_format)
            
            if count > 1 and args.output_format == 'default':
                print()
                
        except Exception as e:
            print(f"Error generating address {i + 1}: {e}", file=sys.stderr)


def lookup_address(args) -> None:
    """Look up a specific address"""
    lookup = SAAddressLookup()
    
    if not lookup.mapbox_api_key:
        print("Error: No Mapbox API key found. Address lookup requires a valid API key.", file=sys.stderr)
        print("Please set MAPBOX_API_KEY in your environment or .env file.", file=sys.stderr)
        sys.exit(1)
    
    print(f"Looking up address: {args.address}")
    print()
    
    try:
        result = lookup.lookup_address(args.address)
        
        if result:
            print_address(result, args.output_format)
        else:
            print("Address not found or not in South Australia.")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error looking up address: {e}", file=sys.stderr)
        sys.exit(1)


def show_options(args) -> None:
    """Show available distribution options"""
    lookup = SAAddressLookup()
    
    try:
        options = lookup.get_available_options()
        
        if args.output_format == 'json':
            print(json.dumps(options, indent=2))
        else:
            print("Available Distribution Options:")
            print("=" * 40)
            
            print(f"\nSuburbs ({len(options['suburbs'])}):")
            for suburb in options['suburbs']:
                print(f"  - {suburb}")
            
            print(f"\nCouncils ({len(options['councils'])}):")
            for council in options['councils']:
                print(f"  - {council}")
            
            print(f"\nRemoteness Levels:")
            for level in options['remoteness_levels']:
                print(f"  - {level}")
            
            print(f"\nSocio-economic Levels:")
            for level in options['socioeconomic_levels']:
                print(f"  - {level}")
                
    except Exception as e:
        print(f"Error retrieving options: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="SA Address Lookup - Generate or lookup South Australian addresses",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s generate 5                          # Generate 5 random addresses
  %(prog)s generate 3 --suburb ADELAIDE        # Generate 3 addresses in Adelaide
  %(prog)s generate 2 --remoteness "Major Cities of Australia"  # City addresses
  %(prog)s generate 1 --socioeconomic 5        # High socio-economic area
  %(prog)s lookup "North Terrace, Adelaide"    # Look up specific address
  %(prog)s options                             # Show available options
  %(prog)s generate 10 --format json           # Output as JSON
  %(prog)s generate 5 --format csv             # Output as CSV
        """
    )
    
    # Global options
    parser.add_argument(
        '--format', 
        dest='output_format',
        choices=['default', 'json', 'csv'],
        default='default',
        help='Output format (default: default)'
    )
    
    # Subcommands
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Generate command
    generate_parser = subparsers.add_parser(
        'generate', 
        help='Generate random SA addresses'
    )
    generate_parser.add_argument(
        'count', 
        type=int, 
        help='Number of addresses to generate'
    )
    
    # Distribution options (mutually exclusive)
    distribution_group = generate_parser.add_mutually_exclusive_group()
    distribution_group.add_argument(
        '--suburb', 
        help='Generate addresses from specific suburb'
    )
    distribution_group.add_argument(
        '--council', 
        help='Generate addresses from specific council'
    )
    distribution_group.add_argument(
        '--remoteness', 
        help='Generate addresses from specific remoteness level'
    )
    distribution_group.add_argument(
        '--socioeconomic', 
        type=int,
        choices=[0, 1, 2, 3, 4, 5],
        help='Generate addresses from specific socio-economic level (0-5)'
    )
    
    # Lookup command
    lookup_parser = subparsers.add_parser(
        'lookup', 
        help='Look up a specific address'
    )
    lookup_parser.add_argument(
        'address', 
        help='Address to look up (e.g., "North Terrace, Adelaide, SA")'
    )
    
    # Options command
    options_parser = subparsers.add_parser(
        'options', 
        help='Show available distribution options'
    )
    
    # Parse arguments
    args = parser.parse_args()
    
    # Handle commands
    if args.command == 'generate':
        if args.count <= 0:
            print("Error: Count must be a positive number", file=sys.stderr)
            sys.exit(1)
        generate_addresses(args)
    elif args.command == 'lookup':
        lookup_address(args)
    elif args.command == 'options':
        show_options(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
