# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-27

### Added
- Initial release of SA Mock Address Generator
- Address generation with customizable distribution parameters
- Support for remoteness and socio-economic filtering
- Google Maps API integration for accurate geocoding
- Address lookup functionality
- Command-line interfaces (`sa-generate-addresses`, `sa-lookup-address`)
- Python API for programmatic usage
- Comprehensive documentation and examples
- Support for CSV export
- Caching system for geocoding results

### Features
- **Address Generation**: Generate realistic SA addresses based on distribution weights
- **Address Lookup**: Look up detailed information for any SA address/suburb/postcode
- **Distribution Control**: 
  - Preset distributions (city_focused, regional_focused, remote_focused, high_socio, low_socio)
  - Custom remoteness level targeting
  - Custom socio-economic level targeting
- **Data Integration**: Uses official South Australian suburb and council mapping data
- **CLI Tools**: Easy-to-use command-line interfaces
- **Python Package**: Installable via pip with proper package structure

### Technical
- Python 3.7+ support
- Dependencies: pandas, numpy, googlemaps, python-dotenv
- Proper package structure with setuptools and pyproject.toml
- Comprehensive test coverage for core functionality
- MIT License
