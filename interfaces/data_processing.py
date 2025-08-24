"""
Data processing interfaces following Single Responsibility and Interface Segregation Principles
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
import pandas as pd


class DataLoader(ABC):
    """Interface for loading data from various sources"""
    
    @abstractmethod
    def load_data(self, source: str) -> pd.DataFrame:
        """Load data from a source"""
        pass
    
    @abstractmethod
    def is_data_valid(self, data: pd.DataFrame) -> bool:
        """Validate loaded data structure"""
        pass


class DataCleaner(ABC):
    """Interface for data cleaning operations"""
    
    @abstractmethod
    def clean_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Clean and prepare data"""
        pass
    
    @abstractmethod
    def remove_invalid_records(self, data: pd.DataFrame) -> pd.DataFrame:
        """Remove invalid records from data"""
        pass


class SuburbFilter(ABC):
    """Interface for filtering suburbs based on various criteria"""
    
    @abstractmethod
    def filter_by_remoteness(self, data: pd.DataFrame, remoteness_level: str) -> pd.DataFrame:
        """Filter suburbs by remoteness level"""
        pass
    
    @abstractmethod
    def filter_by_socioeconomic(self, data: pd.DataFrame, socio_status: int) -> pd.DataFrame:
        """Filter suburbs by socio-economic status"""
        pass
    
    @abstractmethod
    def filter_by_council(self, data: pd.DataFrame, council_name: str) -> pd.DataFrame:
        """Filter suburbs by council"""
        pass


class WeightCalculator(ABC):
    """Interface for calculating sampling weights"""
    
    @abstractmethod
    def calculate_weights(self, 
                         data: pd.DataFrame,
                         remoteness_weights: Dict[str, float],
                         socioeconomic_weights: Dict[int, float]) -> pd.DataFrame:
        """Calculate combined weights for sampling"""
        pass


class SuburbSampler(ABC):
    """Interface for sampling suburbs based on weights"""
    
    @abstractmethod
    def sample_suburbs(self,
                      data: pd.DataFrame,
                      count: int,
                      weights_column: str = 'weight',
                      random_seed: Optional[int] = None) -> List[Dict[str, Any]]:
        """Sample suburbs based on weights"""
        pass


class DataProcessor(ABC):
    """Main data processing interface combining all capabilities"""
    
    @abstractmethod
    def load_and_process_data(self, source: str) -> pd.DataFrame:
        """Load and process data from source"""
        pass
    
    @abstractmethod
    def get_sample_suburbs(self,
                          count: int,
                          remoteness_weights: Dict[str, float],
                          socioeconomic_weights: Dict[int, float],
                          random_seed: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get sampled suburbs with weights"""
        pass
    
    @abstractmethod
    def get_data_summary(self) -> Dict[str, Any]:
        """Get summary of loaded data"""
        pass
