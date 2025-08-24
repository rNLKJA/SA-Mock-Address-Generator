#!/usr/bin/env python3
"""
Example usage of SA_Address_Lookup
"""
from sa_address_lookup import SAAddressLookup


def main():
    """Demonstrate SA_Address_Lookup functionality"""
    
    # Initialize the lookup object
    print("Initializing SA Address Lookup...")
    lookup = SAAddressLookup()
    
    print("\n=== SA Address Lookup Examples ===\n")
    
    # Example 1: Generate default random address
    print("1. Generate a random South Australian address:")
    address = lookup.generate_random_address()
    print(f"   Address: {address['full_address']}")
    print(f"   Council: {address['council']}")
    print(f"   Remoteness: {address['remoteness_level']}")
    print(f"   Socio-economic level: {address['socio_economic_status']}")
    
    # Example 2: Generate address from specific suburb
    print("\n2. Generate address from ADELAIDE suburb:")
    adelaide_addr = lookup.generate_random_address(
        distribution_type='suburb',
        distribution_value='ADELAIDE'
    )
    print(f"   Address: {adelaide_addr['full_address']}")
    
    # Example 3: Generate address from specific council
    print("\n3. Generate address from CITY OF ADELAIDE council:")
    council_addr = lookup.generate_random_address(
        distribution_type='council',
        distribution_value='CITY OF ADELAIDE'
    )
    print(f"   Address: {council_addr['full_address']}")
    
    # Example 4: Generate address based on remoteness
    print("\n4. Generate address from Major Cities area:")
    city_addr = lookup.generate_random_address(
        distribution_type='remoteness',
        distribution_value='Major Cities of Australia'
    )
    print(f"   Address: {city_addr['full_address']}")
    
    # Example 5: Generate address based on socio-economic level
    print("\n5. Generate address from high socio-economic area (level 5):")
    socio_addr = lookup.generate_random_address(
        distribution_type='socioeconomic',
        distribution_value='5'
    )
    print(f"   Address: {socio_addr['full_address']}")
    
    # Example 6: Show available options
    print("\n6. Available distribution options:")
    options = lookup.get_available_options()
    
    print(f"   Suburbs ({len(options['suburbs'])}): {', '.join(options['suburbs'][:5])}...")
    print(f"   Councils ({len(options['councils'])}): {options['councils'][:3]}...")
    print(f"   Remoteness levels: {options['remoteness_levels']}")
    print(f"   Socio-economic levels: {options['socioeconomic_levels']}")
    
    # Example 7: Address lookup (requires Mapbox API key)
    print("\n7. Address lookup example:")
    if lookup.mapbox_api_key:
        print("   Looking up: 'King William Street, Adelaide, SA'")
        result = lookup.lookup_address("King William Street, Adelaide, SA")
        if result:
            print(f"   Found: {result['full_address']}")
            print(f"   Suburb: {result['suburb']}")
            print(f"   Council: {result['council']}")
            print(f"   Coordinates: {result['latitude']}, {result['longitude']}")
        else:
            print("   No results found or address not in SA")
    else:
        print("   (Requires Mapbox API key - see .env.example)")
    
    print("\n=== Examples Complete ===")


if __name__ == "__main__":
    main()
