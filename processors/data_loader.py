"""
Data loading implementation following Single Responsibility Principle
"""
import pandas as pd
import os
import logging
from typing import Optional
from ..interfaces.data_processing import DataLoader

logger = logging.getLogger(__name__)


class CSVDataLoader(DataLoader):
    """CSV file data loader implementation"""
    
    def __init__(self, default_data_path: Optional[str] = None):
        """
        Initialize CSV data loader
        
        Args:
            default_data_path: Default path to data files
        """
        if default_data_path is None:
            # Default to package data directory
            package_dir = os.path.dirname(os.path.dirname(__file__))
            default_data_path = os.path.join(package_dir, "data")
        
        self.default_data_path = default_data_path
    
    def load_data(self, source: str) -> pd.DataFrame:
        """
        Load data from CSV file
        
        Args:
            source: Path to CSV file or filename (will use default path)
            
        Returns:
            DataFrame with loaded data
            
        Raises:
            FileNotFoundError: If file cannot be found
            ValueError: If file cannot be parsed as CSV
        """
        # Resolve file path
        if os.path.isabs(source):
            file_path = source
        elif os.path.exists(source):
            file_path = source
        else:
            # Try default data directory
            file_path = os.path.join(self.default_data_path, source)
            
            # If still not found, try with .csv extension
            if not os.path.exists(file_path) and not source.endswith('.csv'):
                file_path = os.path.join(self.default_data_path, f"{source}.csv")
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Data file not found: {file_path}")
        
        try:
            df = pd.read_csv(file_path)
            logger.info(f"Loaded {len(df)} records from {file_path}")
            
            if df.empty:
                logger.warning(f"Loaded CSV file is empty: {file_path}")
            
            return df
            
        except pd.errors.EmptyDataError:
            raise ValueError(f"CSV file is empty: {file_path}")
        except pd.errors.ParserError as e:
            raise ValueError(f"Failed to parse CSV file {file_path}: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load CSV file {file_path}: {e}")
    
    def is_data_valid(self, data: pd.DataFrame) -> bool:
        """
        Validate that loaded data has expected structure for SA suburbs
        
        Args:
            data: DataFrame to validate
            
        Returns:
            True if data structure is valid
        """
        if data is None or data.empty:
            logger.error("Data is empty or None")
            return False
        
        # Required columns for SA suburb data
        required_columns = ['Suburb', 'Postcode', 'Council', 'Remoteness Level', 'SocioEconomicStatus']
        
        missing_columns = [col for col in required_columns if col not in data.columns]
        if missing_columns:
            logger.error(f"Missing required columns: {missing_columns}")
            return False
        
        # Check for reasonable data types
        try:
            # Postcode should be numeric
            if not pd.api.types.is_numeric_dtype(data['Postcode']):
                # Try to convert
                pd.to_numeric(data['Postcode'], errors='raise')
            
            # SocioEconomicStatus should be numeric
            if not pd.api.types.is_numeric_dtype(data['SocioEconomicStatus']):
                # Try to convert
                pd.to_numeric(data['SocioEconomicStatus'], errors='raise')
                
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid data types in required columns: {e}")
            return False
        
        # Check for reasonable value ranges
        if data['Postcode'].min() < 1000 or data['Postcode'].max() > 9999:
            logger.warning("Postcode values outside expected range (1000-9999)")
        
        # SA postcodes should mostly be 5xxx
        sa_postcodes = data[data['Postcode'].between(5000, 5999)]
        if len(sa_postcodes) < len(data) * 0.8:  # At least 80% should be SA postcodes
            logger.warning("Less than 80% of postcodes appear to be SA postcodes")
        
        logger.info(f"Data validation passed for {len(data)} records")
        return True
    
    def get_data_info(self, data: pd.DataFrame) -> dict:
        """
        Get information about loaded data
        
        Args:
            data: DataFrame to analyze
            
        Returns:
            Dictionary with data information
        """
        if data is None or data.empty:
            return {'error': 'No data available'}
        
        info = {
            'total_records': len(data),
            'columns': list(data.columns),
            'memory_usage_mb': data.memory_usage(deep=True).sum() / 1024 / 1024,
            'missing_values': data.isnull().sum().to_dict(),
            'data_types': data.dtypes.astype(str).to_dict()
        }
        
        # Add specific info for SA suburb data if columns exist
        if 'Suburb' in data.columns:
            info['unique_suburbs'] = data['Suburb'].nunique()
        
        if 'Postcode' in data.columns:
            info['postcode_range'] = {
                'min': int(data['Postcode'].min()),
                'max': int(data['Postcode'].max())
            }
        
        if 'Council' in data.columns:
            info['unique_councils'] = data['Council'].nunique()
        
        if 'Remoteness Level' in data.columns:
            info['remoteness_distribution'] = data['Remoteness Level'].value_counts().to_dict()
        
        return info
