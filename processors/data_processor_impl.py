"""
Data processor implementation using dependency injection and SOLID principles
"""
import pandas as pd
import logging
from typing import Dict, List, Optional, Any

from ..interfaces.data_processing import (
    DataProcessor, DataLoader, DataCleaner, 
    SuburbFilter, WeightCalculator, SuburbSampler
)

logger = logging.getLogger(__name__)


class SuburbFilterImpl:
    """Implementation of suburb filtering operations"""
    
    @staticmethod
    def filter_by_remoteness(data: pd.DataFrame, remoteness_level: str) -> pd.DataFrame:
        """Filter suburbs by remoteness level"""
        if 'Remoteness Level' not in data.columns:
            raise ValueError("'Remoteness Level' column not found in data")
        
        return data[data['Remoteness Level'] == remoteness_level]
    
    @staticmethod
    def filter_by_socioeconomic(data: pd.DataFrame, socio_status: int) -> pd.DataFrame:
        """Filter suburbs by socio-economic status"""
        if 'SocioEconomicStatus' not in data.columns:
            raise ValueError("'SocioEconomicStatus' column not found in data")
        
        return data[data['SocioEconomicStatus'] == socio_status]
    
    @staticmethod
    def filter_by_council(data: pd.DataFrame, council_name: str) -> pd.DataFrame:
        """Filter suburbs by council"""
        if 'Council' not in data.columns:
            raise ValueError("'Council' column not found in data")
        
        return data[data['Council'] == council_name]


class DataProcessorImpl(DataProcessor):
    """
    Implementation of DataProcessor using dependency injection
    
    Follows Single Responsibility and Dependency Inversion principles
    """
    
    def __init__(self,
                 data_loader: DataLoader,
                 data_cleaner: DataCleaner,
                 weight_calculator: WeightCalculator,
                 suburb_sampler: SuburbSampler):
        """
        Initialize data processor with injected dependencies
        
        Args:
            data_loader: Data loading implementation
            data_cleaner: Data cleaning implementation  
            weight_calculator: Weight calculation implementation
            suburb_sampler: Suburb sampling implementation
        """
        self.data_loader = data_loader
        self.data_cleaner = data_cleaner
        self.weight_calculator = weight_calculator
        self.suburb_sampler = suburb_sampler
        self.suburb_filter = SuburbFilterImpl()
        
        # Processed data storage
        self.raw_data: Optional[pd.DataFrame] = None
        self.processed_data: Optional[pd.DataFrame] = None
        self.data_source: Optional[str] = None
        
        # Processing statistics
        self.processing_stats = {
            'load_time': None,
            'clean_time': None,
            'records_loaded': 0,
            'records_after_cleaning': 0,
            'last_processed': None
        }
    
    def load_and_process_data(self, source: str) -> pd.DataFrame:
        """
        Load and process data from source
        
        Args:
            source: Data source (file path, etc.)
            
        Returns:
            Processed DataFrame ready for sampling
        """
        import time
        
        logger.info(f"Loading and processing data from: {source}")
        start_time = time.time()
        
        try:
            # Load data
            load_start = time.time()
            self.raw_data = self.data_loader.load_data(source)
            load_time = time.time() - load_start
            
            # Validate loaded data
            if not self.data_loader.is_data_valid(self.raw_data):
                raise ValueError("Loaded data failed validation")
            
            self.processing_stats['records_loaded'] = len(self.raw_data)
            self.processing_stats['load_time'] = load_time
            
            # Clean data
            clean_start = time.time()
            cleaned_data = self.data_cleaner.clean_data(self.raw_data)
            self.processed_data = self.data_cleaner.remove_invalid_records(cleaned_data)
            clean_time = time.time() - clean_start
            
            self.processing_stats['records_after_cleaning'] = len(self.processed_data)
            self.processing_stats['clean_time'] = clean_time
            self.processing_stats['last_processed'] = time.time()
            
            self.data_source = source
            
            total_time = time.time() - start_time
            logger.info(f"Data processing completed in {total_time:.2f}s: "
                       f"{self.processing_stats['records_loaded']} -> "
                       f"{self.processing_stats['records_after_cleaning']} records")
            
            return self.processed_data
            
        except Exception as e:
            logger.error(f"Data processing failed: {e}")
            raise
    
    def get_sample_suburbs(self,
                          count: int,
                          remoteness_weights: Dict[str, float],
                          socioeconomic_weights: Dict[int, float],
                          random_seed: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get sampled suburbs with weights
        
        Args:
            count: Number of suburbs to sample
            remoteness_weights: Weights for remoteness levels
            socioeconomic_weights: Weights for socio-economic status
            random_seed: Random seed for reproducibility
            
        Returns:
            List of sampled suburb dictionaries
        """
        if self.processed_data is None or self.processed_data.empty:
            raise ValueError("No processed data available. Call load_and_process_data() first.")
        
        logger.info(f"Sampling {count} suburbs with custom weights")
        
        try:
            # Calculate weights
            weighted_data = self.weight_calculator.calculate_weights(
                self.processed_data,
                remoteness_weights,
                socioeconomic_weights
            )
            
            # Sample suburbs
            sampled_suburbs = self.suburb_sampler.sample_suburbs(
                weighted_data,
                count,
                random_seed=random_seed
            )
            
            return sampled_suburbs
            
        except Exception as e:
            logger.error(f"Suburb sampling failed: {e}")
            raise
    
    def get_data_summary(self) -> Dict[str, Any]:
        """Get summary of loaded and processed data"""
        summary = {
            'data_source': self.data_source,
            'processing_stats': self.processing_stats.copy(),
            'raw_data_available': self.raw_data is not None,
            'processed_data_available': self.processed_data is not None
        }
        
        if self.processed_data is not None and not self.processed_data.empty:
            # Add data-specific summary
            summary.update({
                'total_suburbs': len(self.processed_data),
                'unique_suburbs': self.processed_data['Suburb'].nunique(),
                'unique_councils': self.processed_data['Council'].nunique(),
                'postcode_range': {
                    'min': int(self.processed_data['Postcode'].min()),
                    'max': int(self.processed_data['Postcode'].max())
                },
                'remoteness_distribution': self.processed_data['Remoteness Level'].value_counts().to_dict(),
                'socioeconomic_distribution': self.processed_data['SocioEconomicStatus'].value_counts().to_dict()
            })
        
        return summary
    
    def get_filtered_data(self, 
                         remoteness_level: Optional[str] = None,
                         socio_status: Optional[int] = None,
                         council_name: Optional[str] = None) -> pd.DataFrame:
        """
        Get filtered subset of processed data
        
        Args:
            remoteness_level: Filter by remoteness level
            socio_status: Filter by socio-economic status
            council_name: Filter by council name
            
        Returns:
            Filtered DataFrame
        """
        if self.processed_data is None:
            raise ValueError("No processed data available")
        
        filtered_data = self.processed_data
        
        if remoteness_level:
            filtered_data = self.suburb_filter.filter_by_remoteness(filtered_data, remoteness_level)
        
        if socio_status is not None:
            filtered_data = self.suburb_filter.filter_by_socioeconomic(filtered_data, socio_status)
        
        if council_name:
            filtered_data = self.suburb_filter.filter_by_council(filtered_data, council_name)
        
        return filtered_data
    
    def get_unique_values(self) -> Dict[str, List]:
        """Get unique values for key categorical columns"""
        if self.processed_data is None:
            return {}
        
        unique_values = {}
        
        categorical_columns = ['Remoteness Level', 'Council']
        for col in categorical_columns:
            if col in self.processed_data.columns:
                unique_values[col] = sorted(self.processed_data[col].unique().tolist())
        
        # Special handling for socio-economic status (numeric)
        if 'SocioEconomicStatus' in self.processed_data.columns:
            unique_values['SocioEconomicStatus'] = sorted(
                self.processed_data['SocioEconomicStatus'].unique().tolist()
            )
        
        return unique_values
    
    def validate_weights(self, 
                        remoteness_weights: Dict[str, float],
                        socioeconomic_weights: Dict[int, float]) -> Dict[str, Any]:
        """
        Validate weight dictionaries against available data
        
        Args:
            remoteness_weights: Weights for remoteness levels
            socioeconomic_weights: Weights for socio-economic status
            
        Returns:
            Validation results
        """
        validation_result = {
            'valid': True,
            'warnings': [],
            'errors': []
        }
        
        if self.processed_data is None:
            validation_result['errors'].append("No data loaded for weight validation")
            validation_result['valid'] = False
            return validation_result
        
        # Validate remoteness weights
        available_remoteness = set(self.processed_data['Remoteness Level'].unique())
        provided_remoteness = set(remoteness_weights.keys())
        
        missing_remoteness = available_remoteness - provided_remoteness
        extra_remoteness = provided_remoteness - available_remoteness
        
        if missing_remoteness:
            validation_result['warnings'].append(
                f"Missing weights for remoteness levels: {missing_remoteness}"
            )
        
        if extra_remoteness:
            validation_result['warnings'].append(
                f"Weights provided for unknown remoteness levels: {extra_remoteness}"
            )
        
        # Validate socioeconomic weights
        available_socio = set(self.processed_data['SocioEconomicStatus'].unique())
        provided_socio = set(socioeconomic_weights.keys())
        
        missing_socio = available_socio - provided_socio
        extra_socio = provided_socio - available_socio
        
        if missing_socio:
            validation_result['warnings'].append(
                f"Missing weights for socio-economic levels: {missing_socio}"
            )
        
        if extra_socio:
            validation_result['warnings'].append(
                f"Weights provided for unknown socio-economic levels: {extra_socio}"
            )
        
        # Check for negative weights
        negative_remoteness = [k for k, v in remoteness_weights.items() if v < 0]
        negative_socio = [k for k, v in socioeconomic_weights.items() if v < 0]
        
        if negative_remoteness:
            validation_result['errors'].append(
                f"Negative weights not allowed for remoteness levels: {negative_remoteness}"
            )
            validation_result['valid'] = False
        
        if negative_socio:
            validation_result['errors'].append(
                f"Negative weights not allowed for socio-economic levels: {negative_socio}"
            )
            validation_result['valid'] = False
        
        return validation_result
