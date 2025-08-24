# SA Mock Address Generator

A Python package for generating realistic South Australian addresses with customizable distribution parameters based on remoteness and socio-economic data.

## Features

- **Realistic Address Generation**: Generate South Australian addresses with proper street names, suburbs, and postcodes
- **Customizable Distribution**: Control the distribution of addresses based on remoteness and socio-economic factors
- **Mapbox Integration**: Uses Mapbox API for geocoding and coordinate validation
- **Multiple Output Formats**: Generate addresses as DataFrames or save to CSV
- **Address Lookup**: Look up existing address details
- **SOLID Architecture**: Built with dependency injection and clean architecture principles

## Quick Start

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd SA-Mock-Address-Generator
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up your Mapbox API key in a `.env` file:
```bash
MAPBOX_API_KEY=your_mapbox_token
```

### Basic Usage

#### Simple Example Script

Run the example script to see the generator in action:
```bash
python simple_example.py
```

This will demonstrate:
- Available distribution presets
- Default address generation
- City-focused distribution
- Custom remoteness weights
- Custom socio-economic weights
- Address lookup functionality

#### Python API Usage

```python
from api import generate_sa_addresses, lookup_sa_address

# Generate 10 addresses with default distribution
addresses = generate_sa_addresses(10)

# Generate with city-focused distribution
addresses = generate_sa_addresses(count=50, preset='city_focused')

# Generate with custom weights
custom_weights = {
    'Major Cities of Australia': 0.8,
    'Inner Regional Australia': 0.2,
    'Outer Regional Australia': 0.0,
    'Remote Australia': 0.0,
    'Very Remote Australia': 0.0,
    'Not Applicable': 0.0
}
addresses = generate_sa_addresses(count=20, remoteness_weights=custom_weights)

# Look up an address
result = lookup_sa_address("Adelaide")
```

## Distribution Parameters

### Remoteness Levels

The system uses the Australian Bureau of Statistics (ABS) remoteness classification:

- **Major Cities of Australia**: Adelaide and major urban centers
- **Inner Regional Australia**: Regional cities and towns
- **Outer Regional Australia**: Rural towns and communities  
- **Remote Australia**: Remote areas like Port Lincoln
- **Very Remote Australia**: Very remote areas
- **Not Applicable**: Areas not classified (excluded from generation)

### Socio-Economic Index

Based on the ABS Socio-Economic Indexes for Areas (SEIFA):

- **0**: Very low socio-economic status
- **1**: Low socio-economic status
- **2**: Below average socio-economic status
- **3**: Average socio-economic status
- **4**: Above average socio-economic status
- **5**: High socio-economic status

## Customizing Distribution

### Method 1: Direct Weight Configuration

```python
from sa_mock_address_generator import generate_sa_addresses

# Custom remoteness distribution
remoteness_weights = {
    'Major Cities of Australia': 0.7,      # 70% in cities
    'Inner Regional Australia': 0.2,       # 20% in regional areas
    'Outer Regional Australia': 0.08,      # 8% in rural areas
    'Remote Australia': 0.02,              # 2% in remote areas
    'Very Remote Australia': 0.0,          # 0% in very remote areas
    'Not Applicable': 0.0
}

# Custom socio-economic distribution
socioeconomic_weights = {
    0: 0.02,  # 2% very low
    1: 0.05,  # 5% low
    2: 0.15,  # 15% below average
    3: 0.35,  # 35% average
    4: 0.30,  # 30% above average
    5: 0.13   # 13% high
}

addresses = generate_sa_addresses(
    count=100,
    remoteness_weights=remoteness_weights,
    socioeconomic_weights=socioeconomic_weights
)
```

### Method 2: Using Presets

```python
# Available presets
presets = [
    'city_focused',      # Focus on Adelaide and major cities
    'regional_focused',  # Focus on regional towns
    'remote_focused',    # Include more remote areas
    'high_socio',        # Higher socioeconomic areas
    'low_socio'          # Lower socioeconomic areas
]

addresses = generate_sa_addresses(count=100, preset='city_focused')
```

### Method 3: Modifying Default Weights

You can modify the default weights in `config.py`:

```python
# In config.py
DEFAULT_REMOTENESS_WEIGHTS = {
    'Major Cities of Australia': 0.5,      # Increase city focus
    'Inner Regional Australia': 0.3,       # Increase regional focus
    'Outer Regional Australia': 0.15,      # Increase rural focus
    'Remote Australia': 0.05,              # Include some remote areas
    'Very Remote Australia': 0.0,          # Exclude very remote areas
    'Not Applicable': 0.0
}

DEFAULT_SOCIOECONOMIC_WEIGHTS = {
    0: 0.03,  # Reduce very low socio-economic
    1: 0.08,  # Reduce low socio-economic
    2: 0.18,  # Slightly reduce below average
    3: 0.30,  # Keep average as baseline
    4: 0.28,  # Increase above average
    5: 0.13   # Increase high socio-economic
}
```

## Advanced Usage

### Using the API Class

```python
from sa_mock_address_generator import SAAddressAPI

# Initialize API
api = SAAddressAPI()

# Generate addresses with custom configuration
addresses = api.generate_addresses(
    count=100,
    remoteness_weights={'Major Cities of Australia': 1.0},  # Only cities
    socioeconomic_weights={3: 1.0},  # Only average socio-economic
    random_seed=42  # For reproducible results
)

# Get distribution summary
summary = api.get_distribution_summary(addresses)
print(f"Generated {summary['total_addresses']} addresses across {summary['unique_suburbs']} suburbs")
```

### Address Lookup

```python
from sa_mock_address_generator import lookup_sa_address

# Look up by suburb name
result = lookup_sa_address("Adelaide")

# Look up by postcode
result = lookup_sa_address("5000")

# Look up by suburb and postcode
result = lookup_sa_address("Whyalla 5600")

if result:
    print(f"Address: {result['full_address']}")
    print(f"Coordinates: ({result['latitude']}, {result['longitude']})")
    print(f"Remoteness: {result['remoteness']}")
    print(f"Socio-Economic Index: {result['socio_economic_index']}")
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required
MAPBOX_API_KEY=your_mapbox_token

# Optional (for backward compatibility)
MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

### Mapbox API Setup

1. Sign up for a Mapbox account at https://www.mapbox.com/
2. Create an access token
3. Add the token to your `.env` file as `MAPBOX_API_KEY`

## Output Format

Generated addresses include the following fields:

- `street_address`: Full street address (e.g., "123 Main Street")
- `suburb`: Suburb name (e.g., "Adelaide")
- `state`: State abbreviation (e.g., "SA")
- `postcode`: Postcode (e.g., "5000")
- `council`: Local government area
- `remoteness`: ABS remoteness classification
- `socio_economic_index`: SEIFA index (0-5)
- `latitude`: Geographic latitude
- `longitude`: Geographic longitude

## Examples

### City-Focused Generation

```python
# Generate addresses primarily in Adelaide and major cities
addresses = generate_sa_addresses(
    count=50,
    remoteness_weights={
        'Major Cities of Australia': 0.8,
        'Inner Regional Australia': 0.15,
        'Outer Regional Australia': 0.05,
        'Remote Australia': 0.0,
        'Very Remote Australia': 0.0,
        'Not Applicable': 0.0
    }
)
```

### High Socio-Economic Focus

```python
# Generate addresses in higher socio-economic areas
addresses = generate_sa_addresses(
    count=30,
    socioeconomic_weights={
        0: 0.0,   # No very low socio-economic areas
        1: 0.0,   # No low socio-economic areas
        2: 0.1,   # 10% below average
        3: 0.3,   # 30% average
        4: 0.4,   # 40% above average
        5: 0.2    # 20% high socio-economic
    }
)
```

### Regional Focus

```python
# Generate addresses in regional areas
addresses = generate_sa_addresses(
    count=40,
    remoteness_weights={
        'Major Cities of Australia': 0.1,   # 10% in cities
        'Inner Regional Australia': 0.5,    # 50% in inner regional
        'Outer Regional Australia': 0.3,    # 30% in outer regional
        'Remote Australia': 0.1,            # 10% in remote areas
        'Very Remote Australia': 0.0,
        'Not Applicable': 0.0
    }
)
```

## Architecture

The project follows SOLID principles and uses dependency injection:

- **Interfaces**: Define contracts for address generation, data processing, and geocoding
- **Core**: Contains the dependency container and main business logic
- **Generators**: Implement address generation algorithms
- **Processors**: Handle data processing and validation
- **Providers**: Manage external services (Mapbox geocoding)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues, please open an issue on the GitHub repository.
