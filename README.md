# SA Mock Address Generator

A Python package for generating realistic South Australian addresses with customizable distribution parameters based on remoteness and socio-economic data.

Available as both a command-line tool and a Python module.

## Features

- **Command-line tool** for quick address generation
- **Python module** for integration into your projects
- Generate addresses with customizable distribution
- Control remoteness levels (city, regional, remote)
- Control socio-economic levels (low, high)
- **Geo coordinates** (latitude/longitude) for all addresses
- Export results to CSV files
- Look up address details by suburb or postcode
- Simple, maintainable code structure

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

### Option 2: Package Installation (Recommended)
```bash
# Install as editable package for development
pip install -e .

# Or install from source
python setup.py install
```

## Usage

### Command Line Tool

#### Generate Addresses

Generate 10 addresses with default distribution:
```bash
python sa_mock_address_generator/demo/simple_generator.py 10
```

Generate 5 addresses focused on cities:
```bash
python sa_mock_address_generator/demo/simple_generator.py 5 --remoteness city
```

Generate 5 addresses in high socio-economic areas:
```bash
python sa_mock_address_generator/demo/simple_generator.py 5 --socio high
```

Generate addresses with reproducible results:
```bash
python sa_mock_address_generator/demo/simple_generator.py 10 --seed 42
```

Export results to CSV file:
```bash
python sa_mock_address_generator/demo/simple_generator.py 10 --output results.csv
```

### Look Up Addresses

Look up by suburb name:
```bash
python sa_mock_address_generator/demo/simple_generator.py --lookup "Adelaide"
```

Look up by postcode:
```bash
python sa_mock_address_generator/demo/simple_generator.py --lookup "5000"
```

### Show Available Options

```bash
python sa_mock_address_generator/demo/simple_generator.py --presets
```

### Demo Version

For a standalone demo version with CSV export functionality, use the demo script:
```bash
python sa_mock_address_generator/demo/simple_generator.py 10 --output my_addresses.csv
```

### Python Module

After installation, you can use the package in your Python code:

```python
import sa_mock_address_generator as sa_gen

# Generate a single address
address = sa_gen.generate_address()
print(address['full_address'])

# Generate multiple addresses
addresses = sa_gen.generate_addresses(count=10)
print(addresses)

# Access geo coordinates
for idx, row in addresses.iterrows():
    print(f"Address: {row['full_address']}")
    print(f"Coordinates: {row['latitude']}, {row['longitude']}")

# Export to CSV
sa_gen.export_to_csv(addresses, "my_addresses.csv")

# Address lookup
result = sa_gen.lookup_address("Adelaide")
print(result['full_address'])

# Custom distribution weights
city_weights = {
    "Major Cities of Australia": 0.8,
    "Inner Regional Australia": 0.2,
    "Outer Regional Australia": 0.0,
    "Remote Australia": 0.0,
    "Very Remote Australia": 0.0
}

city_addresses = sa_gen.generate_addresses(
    count=5, 
    remoteness_weights=city_weights
)
```

See `example_usage.py` for more detailed examples.

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

Generated addresses include:
- Street number and name
- Suburb and postcode
- State (SA)
- Remoteness classification
- Socio-economic index (1-5)
- **Geo coordinates** (latitude/longitude)

### CSV Export

When using the `--output` option, results are saved to CSV files with all address details including:
- Complete street address
- Full formatted address string
- All distribution parameters
- Geo coordinates for mapping applications

## Example Output

```
Generating 5 South Australian addresses...

Generated 5 addresses:
==================================================
 street_number    street_name         suburb postcode                remoteness  socio_economic_index    latitude  longitude
            12  Garden Street        Whyalla     5600  Inner Regional Australia                     2    -33.0327    137.5648
           146   Ocean Street    Roxby Downs     5725     Very Remote Australia                     2    -30.5631    136.8953
           542   River Street        Whyalla     5600  Inner Regional Australia                     2    -33.0327    137.5648
           272  Church Street North Adelaide     5006 Major Cities of Australia                     5    -34.9089    138.5994
           898 William Street        Whyalla     5600  Inner Regional Australia                     2    -33.0327    137.5648

Distribution Summary:
==============================
Remoteness Distribution:
  Inner Regional Australia    3 ( 60.0%)
  Very Remote Australia       1 ( 20.0%)
  Major Cities of Australia   1 ( 20.0%)

Socio-Economic Distribution:
  Level 2             4 ( 80.0%)
  Level 5  (High)     1 ( 20.0%)
```

## Dependencies

- Python 3.6+
- pandas
- argparse (built-in)
- random (built-in)

## License

MIT License
