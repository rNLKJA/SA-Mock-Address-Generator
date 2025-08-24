"""
Address generation interfaces following Single Responsibility Principle
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
import pandas as pd
from dataclasses import dataclass


@dataclass
class AddressGenerationConfig:
    """Configuration for address generation"""
    count: int
    remoteness_weights: Optional[Dict[str, float]] = None
    socioeconomic_weights: Optional[Dict[int, float]] = None
    random_seed: Optional[int] = None


class StreetAddressGenerator(ABC):
    """Interface for generating street addresses"""
    
    @abstractmethod
    def generate_street_address(self) -> str:
        """Generate a random street address"""
        pass


class DistributionManager(ABC):
    """Interface for managing address distribution parameters"""
    
    @abstractmethod
    def get_default_distribution(self) -> AddressGenerationConfig:
        """Get default distribution parameters"""
        pass
    
    @abstractmethod
    def get_preset_distribution(self, preset_name: str) -> AddressGenerationConfig:
        """Get predefined distribution preset"""
        pass
    
    @abstractmethod
    def validate_distribution(self, config: AddressGenerationConfig) -> bool:
        """Validate distribution configuration"""
        pass


class AddressAssembler(ABC):
    """Interface for assembling complete addresses"""
    
    @abstractmethod
    def assemble_address(self,
                        street_address: str,
                        suburb_info: Dict[str, Any],
                        coordinates: tuple) -> Dict[str, Any]:
        """Assemble a complete address record"""
        pass


class AddressExporter(ABC):
    """Interface for exporting addresses to various formats"""
    
    @abstractmethod
    def export_to_csv(self, addresses: pd.DataFrame, filename: str) -> str:
        """Export addresses to CSV file"""
        pass
    
    @abstractmethod
    def export_to_json(self, addresses: pd.DataFrame, filename: str) -> str:
        """Export addresses to JSON file"""
        pass


class AddressAnalyzer(ABC):
    """Interface for analyzing generated addresses"""
    
    @abstractmethod
    def get_distribution_summary(self, addresses: pd.DataFrame) -> Dict[str, Any]:
        """Get summary of address distribution"""
        pass
    
    @abstractmethod
    def validate_addresses(self, addresses: pd.DataFrame) -> List[str]:
        """Validate generated addresses and return any issues"""
        pass


class AddressGenerator(ABC):
    """Main address generation interface"""
    
    @abstractmethod
    def generate_addresses(self, config: AddressGenerationConfig) -> pd.DataFrame:
        """Generate addresses based on configuration"""
        pass


class AddressLookup(ABC):
    """Interface for address lookup functionality"""
    
    @abstractmethod
    def lookup_address(self, address_query: str) -> Optional[Dict[str, Any]]:
        """Look up address details from a query string"""
        pass
    
    @abstractmethod
    def search_addresses(self, search_criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Search addresses based on criteria"""
        pass
