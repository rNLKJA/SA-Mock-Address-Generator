"""
Data cleaning implementation following Single Responsibility Principle
"""
import pandas as pd
import numpy as np
import logging
from typing import List, Optional
from ..interfaces.data_processing import DataCleaner

logger = logging.getLogger(__name__)


class SADataCleaner(DataCleaner):
    """Data cleaner specifically for SA suburb data"""
    
    def __init__(self):
        """Initialize SA data cleaner"""
        # Define valid remoteness levels for SA
        self.valid_remoteness_levels = {
            'Major Cities of Australia',
            'Inner Regional Australia', 
            'Outer Regional Australia',
            'Remote Australia',
            'Very Remote Australia',
            'Not Applicable'
        }
        
        # Valid socio-economic status range
        self.min_socio_status = 0
        self.max_socio_status = 5
        
        # Valid SA postcode range
        self.min_postcode = 5000
        self.max_postcode = 5999
    
    def clean_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Clean and prepare SA suburb data
        
        Args:
            data: Raw data DataFrame
            
        Returns:
            Cleaned DataFrame
        """
        if data is None or data.empty:
            logger.warning("No data to clean")
            return data
        
        logger.info(f"Starting data cleaning for {len(data)} records")
        
        # Make a copy to avoid modifying original data
        cleaned_data = data.copy()
        
        # Remove unnamed index columns if they exist
        cleaned_data = self._remove_index_columns(cleaned_data)
        
        # Standardize column names
        cleaned_data = self._standardize_column_names(cleaned_data)
        
        # Clean text fields
        cleaned_data = self._clean_text_fields(cleaned_data)
        
        # Convert and validate numeric fields
        cleaned_data = self._clean_numeric_fields(cleaned_data)
        
        # Validate and clean categorical fields
        cleaned_data = self._clean_categorical_fields(cleaned_data)
        
        logger.info(f"Data cleaning completed. {len(cleaned_data)} records remain")
        
        return cleaned_data
    
    def remove_invalid_records(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Remove records that don't meet quality criteria
        
        Args:
            data: DataFrame to filter
            
        Returns:
            DataFrame with invalid records removed
        """
        if data is None or data.empty:
            return data
        
        initial_count = len(data)
        logger.info(f"Removing invalid records from {initial_count} total records")
        
        # Required columns must not be null
        required_columns = ['Suburb', 'Postcode', 'Council', 'Remoteness Level', 'SocioEconomicStatus']
        
        valid_data = data.copy()
        
        # Remove records with null values in required columns
        for col in required_columns:
            if col in valid_data.columns:
                before_count = len(valid_data)
                valid_data = valid_data[valid_data[col].notna()]
                removed = before_count - len(valid_data)
                if removed > 0:
                    logger.info(f"Removed {removed} records with missing {col}")
        
        # Remove records with 'Not Applicable' remoteness (usually not real suburbs)
        if 'Remoteness Level' in valid_data.columns:
            before_count = len(valid_data)
            valid_data = valid_data[valid_data['Remoteness Level'] != 'Not Applicable']
            removed = before_count - len(valid_data)
            if removed > 0:
                logger.info(f"Removed {removed} records with 'Not Applicable' remoteness")
        
        # Remove records with invalid postcodes (should be SA postcodes)
        if 'Postcode' in valid_data.columns:
            before_count = len(valid_data)
            valid_data = valid_data[
                (valid_data['Postcode'] >= self.min_postcode) & 
                (valid_data['Postcode'] <= self.max_postcode)
            ]
            removed = before_count - len(valid_data)
            if removed > 0:
                logger.info(f"Removed {removed} records with invalid postcodes")
        
        # Remove records with invalid socio-economic status
        if 'SocioEconomicStatus' in valid_data.columns:
            before_count = len(valid_data)
            valid_data = valid_data[
                (valid_data['SocioEconomicStatus'] >= self.min_socio_status) & 
                (valid_data['SocioEconomicStatus'] <= self.max_socio_status)
            ]
            removed = before_count - len(valid_data)
            if removed > 0:
                logger.info(f"Removed {removed} records with invalid socio-economic status")
        
        # Remove duplicate suburb-postcode combinations (keep first occurrence)
        if 'Suburb' in valid_data.columns and 'Postcode' in valid_data.columns:
            before_count = len(valid_data)
            valid_data = valid_data.drop_duplicates(subset=['Suburb', 'Postcode'], keep='first')
            removed = before_count - len(valid_data)
            if removed > 0:
                logger.info(f"Removed {removed} duplicate suburb-postcode combinations")
        
        final_count = len(valid_data)
        removed_total = initial_count - final_count
        
        logger.info(f"Invalid record removal completed: {removed_total} records removed, {final_count} valid records remain")
        
        return valid_data
    
    def _remove_index_columns(self, data: pd.DataFrame) -> pd.DataFrame:
        """Remove unnamed index columns"""
        columns_to_drop = [col for col in data.columns if col.startswith('Unnamed:')]
        if columns_to_drop:
            logger.info(f"Removing index columns: {columns_to_drop}")
            data = data.drop(columns=columns_to_drop)
        return data
    
    def _standardize_column_names(self, data: pd.DataFrame) -> pd.DataFrame:
        """Standardize column names"""
        # Define column name mappings if needed
        column_mappings = {
            'suburb': 'Suburb',
            'postcode': 'Postcode', 
            'council': 'Council',
            'remoteness_level': 'Remoteness Level',
            'remoteness': 'Remoteness Level',
            'socioeconomic_status': 'SocioEconomicStatus',
            'socio_economic_status': 'SocioEconomicStatus',
            'seifa': 'SocioEconomicStatus'
        }
        
        # Apply mappings
        data = data.rename(columns=column_mappings)
        
        return data
    
    def _clean_text_fields(self, data: pd.DataFrame) -> pd.DataFrame:
        """Clean text fields (suburb names, council names, etc.)"""
        text_columns = ['Suburb', 'Council', 'Remoteness Level']
        
        for col in text_columns:
            if col in data.columns:
                # Strip whitespace
                data[col] = data[col].astype(str).str.strip()
                
                # Replace empty strings with NaN
                data[col] = data[col].replace('', np.nan)
                
                # Fix common casing issues
                if col in ['Suburb', 'Council']:
                    # Convert to title case but preserve known abbreviations
                    data[col] = data[col].str.title()
                    
                    # Fix common abbreviations
                    replacements = {
                        ' Of ': ' of ',
                        ' The ': ' the ',
                        ' And ': ' and ',
                        'Mt ': 'Mount ',
                        'St ': 'Saint '
                    }
                    
                    for old, new in replacements.items():
                        data[col] = data[col].str.replace(old, new, regex=False)
        
        return data
    
    def _clean_numeric_fields(self, data: pd.DataFrame) -> pd.DataFrame:
        """Clean and convert numeric fields"""
        numeric_columns = {
            'Postcode': 'int64',
            'SocioEconomicStatus': 'int64'
        }
        
        for col, dtype in numeric_columns.items():
            if col in data.columns:
                try:
                    # Convert to numeric, coercing errors to NaN
                    data[col] = pd.to_numeric(data[col], errors='coerce')
                    
                    # Convert to specified integer type
                    data[col] = data[col].astype(dtype)
                    
                except Exception as e:
                    logger.warning(f"Failed to convert {col} to {dtype}: {e}")
        
        return data
    
    def _clean_categorical_fields(self, data: pd.DataFrame) -> pd.DataFrame:
        """Clean and validate categorical fields"""
        if 'Remoteness Level' in data.columns:
            # Standardize remoteness level values
            remoteness_mappings = {
                'major cities of australia': 'Major Cities of Australia',
                'inner regional australia': 'Inner Regional Australia',
                'outer regional australia': 'Outer Regional Australia', 
                'remote australia': 'Remote Australia',
                'very remote australia': 'Very Remote Australia',
                'not applicable': 'Not Applicable'
            }
            
            # Apply case-insensitive mapping
            data['Remoteness Level'] = data['Remoteness Level'].str.lower().map(remoteness_mappings)
            
            # Mark unrecognized values as NaN
            valid_mask = data['Remoteness Level'].isin(self.valid_remoteness_levels)
            invalid_count = (~valid_mask).sum()
            
            if invalid_count > 0:
                logger.warning(f"Found {invalid_count} records with invalid remoteness levels")
                data.loc[~valid_mask, 'Remoteness Level'] = np.nan
        
        return data
    
    def get_cleaning_summary(self, original_data: pd.DataFrame, cleaned_data: pd.DataFrame) -> dict:
        """
        Get summary of cleaning operations performed
        
        Args:
            original_data: Original DataFrame before cleaning
            cleaned_data: DataFrame after cleaning
            
        Returns:
            Dictionary with cleaning summary
        """
        summary = {
            'original_record_count': len(original_data) if original_data is not None else 0,
            'cleaned_record_count': len(cleaned_data) if cleaned_data is not None else 0,
            'records_removed': 0,
            'data_quality_improvements': []
        }
        
        if original_data is not None and cleaned_data is not None:
            summary['records_removed'] = len(original_data) - len(cleaned_data)
            
            # Check for specific improvements
            if 'Suburb' in cleaned_data.columns:
                null_suburbs_before = original_data['Suburb'].isnull().sum() if 'Suburb' in original_data.columns else 0
                null_suburbs_after = cleaned_data['Suburb'].isnull().sum()
                if null_suburbs_after < null_suburbs_before:
                    summary['data_quality_improvements'].append(
                        f"Reduced null suburb names from {null_suburbs_before} to {null_suburbs_after}"
                    )
            
            # Add more quality checks as needed
        
        return summary
