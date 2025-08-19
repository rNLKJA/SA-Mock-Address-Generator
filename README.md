# SA Mock Address Generator

<div align="center">

[![PyPI version](https://badge.fury.io/py/sa-mock-address-generator.svg)](https://badge.fury.io/py/sa-mock-address-generator)
[![Python 3.7+](https://img.shields.io/badge/python-3.7+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/rNLKJA/sa-mock-address-generator/workflows/Test%20Package/badge.svg)](https://github.com/rNLKJA/sa-mock-address-generator/actions)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

*A modern Python package for generating realistic South Australian addresses with customizable distribution parameters.*

[Installation](#installation) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Examples](#examples) • [API Reference](#api-reference)

</div>

## Overview

The SA Mock Address Generator is a comprehensive Python package designed for generating realistic South Australian addresses based on official demographic and geographic data. Perfect for testing, data science projects, and application development where realistic Australian address data is needed.

### Key Features

🏠 **Realistic Address Generation** - Creates valid SA addresses with accurate geocoordinates  
📊 **Data-Driven Distribution** - Uses official ABS demographic classifications  
🎯 **Customizable Parameters** - Control generation based on remoteness and socio-economic factors  
🗺️ **Google Maps Integration** - Validates addresses and provides precise coordinates  
💾 **Multiple Output Formats** - CSV export and Python data structures  
🖥️ **CLI & Python API** - Use via command line or integrate into your Python projects  
🔍 **Address Lookup** - Query detailed information for any SA location  
⚡ **Performance Optimized** - Intelligent caching reduces API calls

## Installation

### Via PyPI (Recommended)

```bash
pip install sa-mock-address-generator
```

### Via Conda

```bash
conda install -c conda-forge sa-mock-address-generator
```

### From Source

```bash
git clone https://github.com/rNLKJA/sa-mock-address-generator.git
cd sa-mock-address-generator
pip install -e .
```

## Quick Start

### Command Line Usage

```bash
# Generate 100 addresses and save to CSV
sa-generate-addresses 100 --output addresses.csv

# Generate addresses focused on Adelaide (major cities)
sa-generate-addresses 50 --remoteness major_cities

# Generate high socio-economic areas only
sa-generate-addresses 25 --socio-economic high

# Look up address information
sa-lookup-address "Adelaide"
sa-lookup-address "5000" --json
```

### Python API

```python
from sa_mock_address_generator import generate_sa_addresses, lookup_sa_address

# Generate addresses with default distribution
addresses = generate_sa_addresses(count=100)
print(addresses.head())

# Generate with custom distribution (80% major cities, 20% regional)
custom_addresses = generate_sa_addresses(
    count=50,
    remoteness_weights={
        'Major Cities of Australia': 0.8,
        'Inner Regional Australia': 0.2,
        'Outer Regional Australia': 0.0,
        'Remote Australia': 0.0,
        'Very Remote Australia': 0.0
    }
)

# Look up address details
address_info = lookup_sa_address("Adelaide")
print(f"Council: {address_info['council']}")
print(f"Remoteness: {address_info['remoteness']}")
print(f"Socio-economic index: {address_info['socio_economic_index']}")
```

## Data Sources & Attribution

This package uses official Australian demographic and geographic classifications:

### Australian Bureau of Statistics (ABS) Data

- **Remoteness Areas**: Based on the [Australian Standard Geographical Classification (ASGC)](https://www.abs.gov.au/websitedbs/D3310114.nsf/home/Australian+Standard+Geographical+Classification+\(ASGC\)) Remoteness Structure
  - Major Cities of Australia
  - Inner Regional Australia  
  - Outer Regional Australia
  - Remote Australia
  - Very Remote Australia

- **Socio-Economic Indexes**: Derived from the [Socio-Economic Indexes for Areas (SEIFA)](https://www.abs.gov.au/websitedbs/censushome.nsf/home/seifa) classifications
  - Index ranges from 0 (most disadvantaged) to 5 (most advantaged)
  - Based on ABS Census data including income, education, employment, and housing indicators

- **Geographic Boundaries**: South Australian suburb and council boundaries as defined by the ABS Australian Standard Geographical Classification

### Google Maps Integration

- **Geocoding**: Uses Google Maps Geocoding API for accurate coordinate generation
- **Address Validation**: Ensures generated addresses correspond to real geographic locations

> **Note**: All demographic classifications and geographic boundaries are used in accordance with ABS licensing terms for statistical and research purposes.

## Configuration

### Google Maps API Key (Optional but Recommended)

For accurate geocoding and address validation:

1. Get a Google Maps API key from the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Geocoding API
3. Set your API key:

```bash
# Environment variable
export GOOGLE_API_KEY="your_api_key_here"

# Or create a .env file
echo "GOOGLE_API_KEY=your_api_key_here" > .env
```

### Virtual Environment Setup

```bash
# Using venv
python -m venv sa-address-env
source sa-address-env/bin/activate  # On Windows: sa-address-env\Scripts\activate
pip install sa-mock-address-generator

# Using conda
conda create -n sa-address-env python=3.9
conda activate sa-address-env
pip install sa-mock-address-generator
```

## Examples

### Address Generation Examples

```python
from sa_mock_address_generator import generate_sa_addresses

# Example 1: Basic generation with seed for reproducibility
addresses = generate_sa_addresses(count=100, random_seed=42)

# Example 2: Focus on Adelaide metropolitan area
adelaide_addresses = generate_sa_addresses(
    count=50,
    remoteness_weights={'Major Cities of Australia': 1.0},
    output_file='adelaide_addresses.csv'
)

# Example 3: Generate addresses from disadvantaged areas
low_socio_addresses = generate_sa_addresses(
    count=30,
    socioeconomic_weights={0: 0.4, 1: 0.6},  # Focus on lower socio-economic areas
    random_seed=123
)

# Example 4: Rural and remote areas only
rural_addresses = generate_sa_addresses(
    count=20,
    remoteness_weights={
        'Outer Regional Australia': 0.5,
        'Remote Australia': 0.3,
        'Very Remote Australia': 0.2
    }
)
```

### Address Lookup Examples

```python
from sa_mock_address_generator import lookup_sa_address

# Look up by suburb name
adelaide_info = lookup_sa_address("Adelaide")
print(f"Population center: {adelaide_info['remoteness']}")

# Look up by postcode
postcode_info = lookup_sa_address("5600")  # Whyalla
print(f"Council: {postcode_info['council']}")

# Look up with full address
full_info = lookup_sa_address("Mount Gambier 5290")
print(f"Socio-economic index: {full_info['socio_economic_index']}")
```

## API Reference

### Core Functions

#### `generate_sa_addresses()`

Generate South Australian addresses with customizable distribution parameters.

**Parameters:**
- `count` (int): Number of addresses to generate
- `remoteness_weights` (dict, optional): Custom weights for remoteness categories
- `socioeconomic_weights` (dict, optional): Custom weights for socio-economic levels (0-5)
- `output_file` (str, optional): Path to save CSV output
- `random_seed` (int, optional): Seed for reproducible results
- `preset` (str, optional): Use predefined distribution ('city_focused', 'regional_focused', 'remote_focused', 'high_socio', 'low_socio')

**Returns:**
- `pandas.DataFrame`: Generated addresses with columns: street_address, suburb, postcode, latitude, longitude, council, remoteness, socio_status

#### `lookup_sa_address()`

Look up detailed information for a South Australian location.

**Parameters:**
- `address` (str): Address, suburb name, or postcode to lookup
- `csv_file` (str, optional): Path to custom suburb data CSV

**Returns:**
- `dict` or `None`: Address information including full_address, suburb, state, postcode, council, remoteness, socio_economic_index, latitude, longitude

### Command Line Interface

#### `sa-generate-addresses`

```bash
sa-generate-addresses COUNT [OPTIONS]

Options:
  --output, -o PATH           Output CSV filename
  --preset PRESET            Use predefined distribution
  --remoteness LEVEL          Focus on specific remoteness level
  --socio-economic LEVEL      Focus on specific socio-economic level
  --seed INTEGER             Random seed for reproducible results
  --show-summary             Show distribution summary
  --help                     Show help message
```

#### `sa-lookup-address`

```bash
sa-lookup-address ADDRESS [OPTIONS]

Options:
  --json                     Output in JSON format
  --help                     Show help message
```

## Distribution Parameters

### Default Remoteness Weights
- **Major Cities of Australia**: 40% (Adelaide, major urban centers)
- **Inner Regional Australia**: 25% (Regional cities and towns)
- **Outer Regional Australia**: 20% (Rural towns like Whyalla, Port Augusta)
- **Remote Australia**: 10% (Remote areas like Port Lincoln)
- **Very Remote Australia**: 5% (Very remote areas)

### Default Socio-Economic Weights
- **Level 0** (Most Disadvantaged): 5%
- **Level 1** (Disadvantaged): 10%
- **Level 2** (Below Average): 20%
- **Level 3** (Average): 25%
- **Level 4** (Above Average): 25%
- **Level 5** (Most Advantaged): 15%

## Development

### Setting Up Development Environment

```bash
git clone https://github.com/rNLKJA/sa-mock-address-generator.git
cd sa-mock-address-generator

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in development mode
pip install -e ".[dev]"

# Run tests
python -m pytest tests/ -v

# Run linting
flake8 sa_mock_address_generator/
black --check sa_mock_address_generator/
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=sa_mock_address_generator

# Run specific test file
pytest tests/test_basic.py -v
```

### Building the Package

```bash
# Install build tools
pip install build twine

# Build package
python -m build

# Check built package
twine check dist/*
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Australian Bureau of Statistics (ABS)** for providing comprehensive demographic and geographic classification data
- **Google Maps Platform** for geocoding services
- **South Australian Government** for geographic boundary definitions
- **Python Community** for excellent packaging and development tools

## Support

- 📖 [Documentation](https://github.com/rNLKJA/sa-mock-address-generator#readme)
- 🐛 [Issue Tracker](https://github.com/rNLKJA/sa-mock-address-generator/issues)
- 💬 [Discussions](https://github.com/rNLKJA/sa-mock-address-generator/discussions)

---

<div align="center">
Made with ❤️ by <a href="https://github.com/rNLKJA">rNLKJA</a>
</div>