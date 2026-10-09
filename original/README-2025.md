<div align="center">

# SA Mock Address Generator

Generate realistic mock South Australian addresses — weighted by remoteness and
socio-economic data — with optional Mapbox geocoding for real address lookup.

[![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![pandas](https://img.shields.io/badge/pandas-data-150458?logo=pandas&logoColor=white)](https://pandas.pydata.org/)
[![Mapbox](https://img.shields.io/badge/Mapbox-geocoding-000000?logo=mapbox&logoColor=white)](https://www.mapbox.com/)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
[![Status: stable](https://img.shields.io/badge/status-stable-brightgreen.svg)](#)

</div>

## Overview

SA Mock Address Generator produces synthetic South Australian addresses for
testing, demos, and data work where you need plausible — but not real — address
records. Each generated address carries a suburb, postcode, council, socio-economic
band, and remoteness classification, drawn from a bundled reference table of ~1,890
SA suburbs.

It also offers a real **address lookup** mode: given a street address, it geocodes
via the Mapbox API, confirms the result sits in South Australia, and returns the
matching suburb and council details. Lookup needs a Mapbox key; generation does not.

## Highlights

- **Random address generation** — valid SA addresses with realistic street names,
  suburbs, postcodes, and councils.
- **Distribution control** — filter generation by suburb, council, remoteness level,
  or socio-economic band.
- **Address lookup** — geocode a real address through Mapbox and map it back to SA
  suburb and council data.
- **Geo coordinates** — latitude and longitude on every address (via geocoding when
  a Mapbox key is set).
- **Multiple output formats** — human-readable, JSON, or CSV.
- **Three ways in** — `SAAddressLookup` Python class, a `cli.py` command-line tool,
  or the `sa_address` wrapper script.
- Fully type-hinted, dependency-light code.

## Tech Stack

| Layer          | Choice                                |
| -------------- | ------------------------------------- |
| Language       | Python 3.8+                           |
| Data handling  | pandas                                |
| Geocoding      | Mapbox Geocoding API (via `requests`) |
| Config         | `python-dotenv`                       |
| Reference data | Bundled SA suburbs CSV (~1,890 rows)  |

## Getting Started

### 1. Clone and set up a virtual environment

```bash
git clone https://github.com/rNLKJA/SA-Mock-Address-Generator.git
cd SA-Mock-Address-Generator
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

> Note: `requirements.txt` lists `pandas`. Address lookup also needs `requests`
> and `python-dotenv` (`pip install requests python-dotenv`).

### 3. Configure Mapbox (optional — lookup only)

```bash
cp env.example .env
# Edit .env and add your Mapbox key
```

Generation works without a key; only **lookup** and live geocoding need one. Grab a
free public token from [mapbox.com](https://www.mapbox.com/) — the free tier covers
100,000 requests a month.

```bash
# .env
MAPBOX_API_KEY=your_mapbox_api_key_here
MAPBOX_ACCESS_TOKEN=your_mapbox_api_key_here   # alternative name, both supported
```

## Usage

### Command line

```bash
# Generate five random SA addresses
python cli.py generate 5

# Filter generation (one parameter at a time)
python cli.py generate 3 --suburb ADELAIDE
python cli.py generate 2 --council "CITY OF ADELAIDE"
python cli.py generate 1 --remoteness "Major Cities of Australia"
python cli.py generate 1 --socioeconomic 5

# Output formats
python cli.py --format json generate 1 --suburb ADELAIDE
python cli.py --format csv generate 5 --remoteness "Major Cities of Australia"

# Look up a real address (needs a Mapbox key)
python cli.py lookup "North Terrace, Adelaide, SA"

# List available suburbs, councils, remoteness and socio-economic options
python cli.py options
```

The `sa_address` wrapper does the same without typing `python cli.py`:

```bash
chmod +x sa_address   # one-time
./sa_address generate 5
```

### Python

```python
from sa_address_lookup import SAAddressLookup

lookup = SAAddressLookup()  # loads the Mapbox key from the environment if present

# Generate a random address
address = lookup.generate_random_address()
print(address["full_address"], "—", address["council"])

# Generate with a distribution filter
adelaide = lookup.generate_random_address(
    distribution_type="suburb", distribution_value="ADELAIDE"
)

# Look up a real address (needs a Mapbox key)
result = lookup.lookup_address("North Terrace, Adelaide, SA")
if result:
    print(result["full_address"], result["latitude"], result["longitude"])

# Inspect available filter options
options = lookup.get_available_options()
print(options["councils"][:3])
```

See `example_usage.py` for a full walkthrough of every mode.

## Output Format

Both generation and lookup return a dictionary:

```python
{
    "street_address": "123 King William Street",
    "full_address": "123 King William Street, ADELAIDE SA 5000",
    "suburb": "ADELAIDE",
    "postcode": "5000",
    "council": "CITY OF ADELAIDE",
    "latitude": -34.9285,
    "longitude": 138.6007,
    "socio_economic_status": 4,                    # band 0–5
    "remoteness_level": "Major Cities of Australia"
}
```

## Project Structure

```
SA-Mock-Address-Generator/
├── sa_address_lookup.py   # SAAddressLookup class — generation + lookup
├── cli.py                 # command-line interface
├── sa_address             # convenience wrapper for the CLI
├── config.py              # Mapbox config + default distribution weights
├── example_usage.py       # worked examples of every mode
├── requirements.txt       # dependencies
├── env.example            # template for your .env
└── data/
    ├── sa_suburbs_data.csv                  # SA suburb reference table
    └── regional_coastal_addresses_1.9k.csv  # sample generated addresses
```

## Data

The reference data is a table of South Australian suburbs with public-classification
fields — postcode, local council, an ABS-style remoteness level, and a socio-economic
band (0–5). All bundled address rows are **synthetic** (generated street numbers,
geocoded via Mapbox). No real personal or contact data is included.

## License

Released under the [MIT License](#license).
