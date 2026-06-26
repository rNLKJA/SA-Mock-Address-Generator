# SA Mock Address Generator

A Python package for generating realistic South Australian addresses with customizable distribution parameters based on remoteness and socio-economic data. Features Mapbox integration for real address lookup and geocoding.

## Features

- **Command Line Interface** - Easy-to-use CLI for terminal operations
- **SA_Address_Lookup** - Main class for address operations
- **Address Lookup** - Look up real addresses and return SA suburb/council data
- **Random Address Generation** - Generate valid SA addresses with distribution controls
- **Geo coordinates** - Latitude/longitude for all addresses
- **Distribution Control** - Filter by suburb, council, remoteness, or socio-economic level
- **Multiple Output Formats** - Default, JSON, and CSV output support
- **Mapbox Integration** - Real geocoding and address validation
- Simple, maintainable code structure with full type hints

## Installation

### Option 1: Development Installation
1. Clone the repository
2. Create virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure API access (optional for address lookup):
```bash
cp .env.example .env
# Edit .env and add your Mapbox API key
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Mapbox API Key (required for address lookup and geocoding)
MAPBOX_API_KEY=your_mapbox_api_key_here
# Alternative name (both are supported)
MAPBOX_ACCESS_TOKEN=your_mapbox_api_key_here
```

### Getting a Mapbox API Key

1. Sign up for a free account at [Mapbox.com](https://www.mapbox.com/)
2. Go to your Account page and copy your default public token
3. Add it to your `.env` file as shown above

**Note:** Address lookup functionality requires a valid Mapbox API key. Random address generation works without an API key but won't include geo coordinates.

### Configuration Options

The following configuration options are available in `config.py`:

- `MAPBOX_API_KEY` - Your Mapbox API key for geocoding
- `MAX_VALIDATION_RETRIES` - Number of retries for API calls (default: 3)
- `DEFAULT_REMOTENESS_WEIGHTS` - Default distribution weights for remoteness levels
- `DEFAULT_SOCIOECONOMIC_WEIGHTS` - Default distribution weights for socio-economic levels

### Example .env File

Create a `.env` file in your project root:

```bash
# Mapbox API Configuration
MAPBOX_API_KEY=pk.eyJ1IjoieW91cnVzZXJuYW1lIiwiYSI6ImNsaXp4eXogZXhhbXBsZWtleSJ9.example-key-here

# Alternative naming (both supported)
MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoieW91cnVzZXJuYW1lIiwiYSI6ImNsaXp4eXogZXhhbXBsZWtleSJ9.example-key-here
```

**Important:** 
- Without a Mapbox API key, address lookup will not work
- Random address generation will work but won't include geo coordinates
- The free Mapbox tier includes 100,000 requests per month

## Usage

### Command Line Interface (CLI)

The CLI provides an easy way to generate and lookup addresses from the terminal:

#### Generate Random Addresses

```bash
# Activate virtual environment
source .venv/bin/activate

# Generate 5 random addresses
python cli.py generate 5

# Generate addresses with distribution filters (single parameter only)
python cli.py generate 3 --suburb ADELAIDE
python cli.py generate 2 --council "CITY OF ADELAIDE"
python cli.py generate 1 --remoteness "Major Cities of Australia"
python cli.py generate 1 --socioeconomic 5

# Different output formats
python cli.py --format json generate 1 --suburb ADELAIDE
python cli.py --format csv generate 5 --remoteness "Major Cities of Australia"
```

#### Look Up Addresses

```bash
# Look up a real address (requires Mapbox API key)
python cli.py lookup "North Terrace, Adelaide, SA"
python cli.py lookup "King William Street, Adelaide"

# JSON output for lookup
python cli.py --format json lookup "Rundle Mall, Adelaide"
```

#### Show Available Options

```bash
# Show all available suburbs, councils, remoteness levels, etc.
python cli.py options

# Show options in JSON format
python cli.py --format json options
```

#### CLI Help

```bash
# General help
python cli.py --help

# Command-specific help
python cli.py generate --help
python cli.py lookup --help
```

#### Alternative: Executable Script

For convenience, you can also use the included executable script:

```bash
# Make executable (one-time setup)
chmod +x sa_address

# Use directly
./sa_address generate 5
./sa_address lookup "North Terrace, Adelaide"
./sa_address options
```

### Python Module (Recommended)

The main interface is the `SAAddressLookup` class:

```python
from sa_address_lookup import SAAddressLookup

# Initialize (automatically loads Mapbox API key from environment)
lookup = SAAddressLookup()

# Generate a random address
address = lookup.generate_random_address()
print(f"Address: {address['street_address']}")
print(f"Suburb: {address['suburb']}")
print(f"Council: {address['council']}")
print(f"Postcode: {address['postcode']}")
print(f"Coordinates: {address['latitude']}, {address['longitude']}")

# Generate with distribution control (single parameter only)
adelaide_address = lookup.generate_random_address(
    distribution_type='suburb', 
    distribution_value='ADELAIDE'
)

council_address = lookup.generate_random_address(
    distribution_type='council', 
    distribution_value='CITY OF ADELAIDE'
)

city_address = lookup.generate_random_address(
    distribution_type='remoteness', 
    distribution_value='Major Cities of Australia'
)

high_socio_address = lookup.generate_random_address(
    distribution_type='socioeconomic', 
    distribution_value='5'
)

# Look up real addresses (requires Mapbox API key)
result = lookup.lookup_address("North Terrace, Adelaide, SA")
if result:
    print(f"Found: {result['full_address']}")
    print(f"Council: {result['council']}")
    print(f"Coordinates: {result['latitude']}, {result['longitude']}")

# Get available options for distribution
options = lookup.get_available_options()
print(f"Available suburbs: {options['suburbs']}")
print(f"Available councils: {options['councils']}")
print(f"Remoteness levels: {options['remoteness_levels']}")
print(f"Socioeconomic levels: {options['socioeconomic_levels']}")
```

### Quick Test

Run the example script to test functionality:

```bash
# Activate virtual environment
source .venv/bin/activate

# Run example usage
python example_usage.py
```

See `example_usage.py` for comprehensive usage examples.

## Geo Coordinates

All generated addresses include accurate latitude and longitude coordinates for South Australian locations. These coordinates can be used for:

- **Mapping applications**: Plot addresses on interactive maps
- **Distance calculations**: Calculate distances between addresses
- **Geospatial analysis**: Perform location-based analytics
- **API integration**: Use with mapping services like Google Maps, Mapbox, etc.

### Coordinate Accuracy

The coordinates represent the approximate center of each suburb/town in South Australia:
- **Adelaide**: -34.9285, 138.6007
- **North Adelaide**: -34.9089, 138.5994
- **Whyalla**: -33.0327, 137.5648
- **Mount Gambier**: -37.8312, 140.7792
- **Port Lincoln**: -34.7261, 135.8575
- **Port Augusta**: -32.4924, 137.7728
- **Murray Bridge**: -35.1197, 139.2734
- **Victor Harbor**: -35.5500, 138.6167
- **Coober Pedy**: -29.0139, 134.7544
- **Roxby Downs**: -30.5631, 136.8953

## Distribution Parameters

### Remoteness Levels

- **city**: Focus on Adelaide and major cities (80% cities, 20% regional)
- **regional**: Focus on regional towns (10% cities, 50% regional, 30% rural, 10% remote)
- **remote**: Include more remote areas (0% cities, 20% regional, 30% rural, 30% remote, 20% very remote)

### Socio-Economic Levels

- **low**: Focus on lower socio-economic areas (30% low, 40% below average, 20% average, 10% above average, 0% high)
- **high**: Focus on higher socio-economic areas (0% low, 10% below average, 30% average, 40% above average, 20% high)

## Project Structure

```
SA Mock Address Generator/
├── sa_mock_address_generator/     # Main Python package
│   ├── __init__.py               # Package exports
│   ├── config.py                 # Configuration settings
│   ├── data/                     # Sample data files
│   └── demo/                     # Demo scripts and examples
│       ├── simple_generator.py   # Command-line interface
│       └── config.py             # Demo configuration
├── example_usage.py              # Module usage examples
├── quick_demo.py                 # Quick demonstration script
├── setup.py                      # Package installation script
├── requirements.txt              # Dependencies
└── README.md                     # Documentation
```

### Core Functions

The package provides these main functions:

- `generate_address()`: Generate a single address
- `generate_addresses()`: Generate multiple addresses  
- `lookup_address()`: Look up address details
- `export_to_csv()`: Export results to CSV file
- `get_available_presets()`: Show distribution presets

## Customization

To modify the distribution weights, edit the constants in the script:

```python
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
```

## Output Format

Both address generation and lookup return a dictionary with the following fields:

```python
{
    'street_address': '123 King William Street',  # Street address only
    'full_address': '123 King William Street, ADELAIDE SA 5000',  # Complete address
    'suburb': 'ADELAIDE',                        # Suburb name
    'postcode': '5000',                         # Postcode  
    'council': 'CITY OF ADELAIDE',              # Local council
    'latitude': -34.9285,                       # Latitude coordinate
    'longitude': 138.6007,                      # Longitude coordinate
    'socio_economic_status': 4,                 # Socio-economic level (0-5)
    'remoteness_level': 'Major Cities of Australia'  # Remoteness classification
}
```

### Address Generation vs Lookup

- **Generated addresses** include all fields above, with coordinates obtained via geocoding
- **Looked up addresses** return the same fields, validated against SA suburbs data
- Both functions return `None` if the address is not in South Australia

## Example Output

### CLI Examples

**Generate random addresses:**
```bash
$ python cli.py generate 2

Generating 2 South Australian addresses...

=== Address 1 ===
Address: 609 Pulteney Street, BORDERTOWN SA 5268
Street: 609 Pulteney Street
Suburb: BORDERTOWN
Postcode: 5268
Council: THE DISTRICT COUNCIL OF TATIARA
Coordinates: -36.309628, 140.77188
Remoteness: Outer Regional Australia
Socio-economic level: 1

=== Address 2 ===
Address: 706 Rundle Street, LOXTON SA 5333
Street: 706 Rundle Street
Suburb: LOXTON
Postcode: 5333
Council: THE DISTRICT COUNCIL OF LOXTON WAIKERIE
Coordinates: -34.452465, 140.57039
Remoteness: Inner Regional Australia
Socio-economic level: 1
```

**Address lookup:**
```bash
$ python cli.py lookup "North Terrace, Adelaide, SA"

Looking up address: North Terrace, Adelaide, SA

Address: North Terrace, Adelaide South Australia 5000, Australia
Street: North Terrace
Suburb: ADELAIDE
Postcode: 5000
Council: CITY OF ADELAIDE
Coordinates: -34.921237, 138.604356
Remoteness: Major Cities of Australia
Socio-economic level: 4
```

**JSON output:**
```bash
$ python cli.py --format json generate 1 --suburb ADELAIDE

{
  "street_address": "791 Port Road",
  "street_number": 791,
  "street_name": "Port Road",
  "suburb": "UNLEY",
  "postcode": 5061,
  "full_address": "791 Port Road, UNLEY SA 5061",
  "council": "CITY OF UNLEY",
  "latitude": -34.63616,
  "longitude": 135.66803,
  "socio_economic_status": 4,
  "remoteness_level": "Major Cities of Australia"
}
```

## Dependencies

- Python 3.6+
- pandas
- argparse (built-in)
- random (built-in)

## License

MIT License
