"""
Setup script for SA Mock Address Generator package
"""
from setuptools import setup, find_packages
import os

# Read the contents of README file
this_directory = os.path.abspath(os.path.dirname(__file__))
with open(os.path.join(this_directory, 'README.md'), encoding='utf-8') as f:
    long_description = f.read()

# Read requirements
with open(os.path.join(this_directory, 'requirements.txt'), encoding='utf-8') as f:
    requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]

setup(
    name="sa-mock-address-generator",
    version="1.0.0",
    author="rNLKJA",
    author_email="contact@rnlkja.com",
    description="Generate realistic South Australian addresses with customizable distribution parameters",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/rNLKJA/sa-mock-address-generator",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Scientific/Engineering :: GIS",
        "Topic :: Scientific/Engineering :: Information Analysis",
        "Topic :: Utilities",
        "Topic :: Database",
        "Typing :: Typed",
    ],
    python_requires=">=3.7",
    install_requires=requirements,
    include_package_data=True,
    package_data={
        'sa_mock_address_generator': ['data/*.csv', 'data/*.json'],
    },
    entry_points={
        'console_scripts': [
            'sa-generate-addresses=sa_mock_address_generator.cli:main',
            'sa-lookup-address=sa_mock_address_generator.lookup_cli:main',
        ],
    },
    keywords=[
        "address", "generator", "south australia", "mock data", "fake data",
        "geocoding", "socioeconomic", "remoteness", "testing", "abs", "australia",
        "demographics", "geospatial", "data science"
    ],
    project_urls={
        "Bug Reports": "https://github.com/rNLKJA/sa-mock-address-generator/issues",
        "Source": "https://github.com/rNLKJA/sa-mock-address-generator",
        "Documentation": "https://github.com/rNLKJA/sa-mock-address-generator#readme",
    },
)
