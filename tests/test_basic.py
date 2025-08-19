"""
Basic tests for SA Mock Address Generator
"""
import pytest
from sa_mock_address_generator import generate_sa_addresses, lookup_sa_address, SAAddressAPI


def test_package_imports():
    """Test that package imports work correctly"""
    # This test passes if imports don't raise exceptions
    assert generate_sa_addresses is not None
    assert lookup_sa_address is not None
    assert SAAddressAPI is not None


def test_lookup_adelaide():
    """Test looking up Adelaide"""
    result = lookup_sa_address("Adelaide")
    assert result is not None
    assert result['suburb'] == 'ADELAIDE'
    assert result['state'] == 'SA'
    assert result['postcode'] == 5000
    assert result['council'] == 'CITY OF ADELAIDE'
    assert result['remoteness'] == 'Major Cities of Australia'


def test_lookup_nonexistent():
    """Test looking up non-existent location"""
    result = lookup_sa_address("NonExistentPlace123")
    assert result is None


def test_generate_addresses():
    """Test generating addresses"""
    addresses = generate_sa_addresses(count=5, random_seed=42)
    
    assert len(addresses) == 5
    assert 'street_address' in addresses.columns
    assert 'suburb' in addresses.columns
    assert 'postcode' in addresses.columns
    assert 'latitude' in addresses.columns
    assert 'longitude' in addresses.columns
    assert 'council' in addresses.columns
    assert 'remoteness' in addresses.columns
    assert 'socio_status' in addresses.columns


def test_generate_addresses_with_weights():
    """Test generating addresses with custom weights"""
    remoteness_weights = {
        'Major Cities of Australia': 1.0,
        'Inner Regional Australia': 0.0,
        'Outer Regional Australia': 0.0,
        'Remote Australia': 0.0,
        'Very Remote Australia': 0.0,
        'Not Applicable': 0.0
    }
    
    addresses = generate_sa_addresses(
        count=3, 
        remoteness_weights=remoteness_weights,
        random_seed=42
    )
    
    assert len(addresses) == 3
    # All addresses should be from major cities
    assert all(addresses['remoteness'] == 'Major Cities of Australia')


def test_api_class():
    """Test the SAAddressAPI class"""
    api = SAAddressAPI()
    
    # Test lookup
    result = api.lookup_address("Adelaide")
    assert result is not None
    assert result['suburb'] == 'ADELAIDE'
    
    # Test address generation
    addresses = api.generate_addresses(count=2, random_seed=123)
    assert len(addresses) == 2


if __name__ == "__main__":
    pytest.main([__file__])
