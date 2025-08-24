#!/usr/bin/env python3
"""
SA Mock Address Generator - Simple Entry Point

A simple entry point for generating South Australian addresses with customizable
distribution parameters based on remoteness and socio-economic data.

Usage:
    python main.py [count] [options]
    
Examples:
    python main.py 100                    # Generate 100 addresses
    python main.py 50 --preset city_focused
    python main.py 20 --remoteness major_cities
    python main.py 30 --socio-economic high
    python main.py --lookup "Adelaide"    # Look up address details
"""

import sys
from cli import main

if __name__ == "__main__":
    main()
