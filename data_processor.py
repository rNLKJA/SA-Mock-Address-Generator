"""
Data processor for SA suburb and socio-economic data
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SADataProcessor:
    """Process and manage South Australian suburb data"""
    
    def __init__(self, csv_file: str = "data/sa_suburbs_data.csv"):
        self.csv_file = csv_file
        self.df = None
        self.processed_df = None
        self.load_data()
        
    def load_data(self) -> None:
        """Load and perform initial processing of the CSV data"""
        try:
            self.df = pd.read_csv(self.csv_file)
            logger.info(f"Loaded {len(self.df)} records from {self.csv_file}")
            self.clean_data()
        except FileNotFoundError:
            logger.error(f"CSV file {self.csv_file} not found")
            raise
        except Exception as e:
            logger.error(f"Error loading data: {e}")
            raise
    
    def clean_data(self) -> None:
        """Clean and prepare the data for address generation"""
        # Remove unnamed index column if it exists
        if 'Unnamed: 0' in self.df.columns:
            self.df = self.df.drop('Unnamed: 0', axis=1)
        
        # Create processed dataframe with only valid suburbs
        self.processed_df = self.df[
            (self.df['Remoteness Level'] != 'Not Applicable') &
            (self.df['Suburb'].notna()) &
            (self.df['Postcode'].notna()) &
            (self.df['SocioEconomicStatus'].notna()) &
            (self.df['Council'].notna())
        ].copy()
        
        # Convert socio-economic status to int
        self.processed_df['SocioEconomicStatus'] = \
            self.processed_df['SocioEconomicStatus'].astype(int)
        
        # Convert postcode to int
        self.processed_df['Postcode'] = self.processed_df['Postcode'].astype(int)
        
        logger.info(f"Processed data: {len(self.processed_df)} valid suburbs")
        logger.info(f"Remoteness distribution: {self.processed_df['Remoteness Level'].value_counts().to_dict()}")
        logger.info(f"Council count: {self.processed_df['Council'].nunique()} unique councils")
        logger.info(f"Socio-economic range: {self.processed_df['SocioEconomicStatus'].min()}-{self.processed_df['SocioEconomicStatus'].max()}")
        
    def get_suburbs_by_remoteness(self, remoteness_level: str) -> pd.DataFrame:
        """Get all suburbs for a specific remoteness level"""
        return self.processed_df[self.processed_df['Remoteness Level'] == remoteness_level]
    
    def get_suburbs_by_socioeconomic(self, socio_status: int) -> pd.DataFrame:
        """Get all suburbs for a specific socio-economic status"""
        return self.processed_df[self.processed_df['SocioEconomicStatus'] == socio_status]
    
    def get_suburbs_by_council(self, council_name: str) -> pd.DataFrame:
        """Get all suburbs for a specific council"""
        return self.processed_df[self.processed_df['Council'] == council_name]
    
    def get_weighted_suburbs(self, 
                           remoteness_weights: Dict[str, float],
                           socioeconomic_weights: Dict[int, float]) -> pd.DataFrame:
        """
        Get suburbs with combined probability weights based on remoteness and socio-economic status
        
        Args:
            remoteness_weights: Dictionary mapping remoteness levels to weights
            socioeconomic_weights: Dictionary mapping socio-economic status to weights
            
        Returns:
            DataFrame with additional 'weight' column
        """
        df_weighted = self.processed_df.copy()
        
        # Map remoteness weights
        df_weighted['remoteness_weight'] = df_weighted['Remoteness Level'].map(remoteness_weights)
        
        # Map socioeconomic weights  
        df_weighted['socioeconomic_weight'] = df_weighted['SocioEconomicStatus'].map(socioeconomic_weights)
        
        # Calculate combined weight (multiply both weights)
        df_weighted['weight'] = df_weighted['remoteness_weight'] * df_weighted['socioeconomic_weight']
        
        # Remove rows with zero or null weights
        df_weighted = df_weighted[df_weighted['weight'] > 0]
        
        logger.info(f"Weighted suburbs: {len(df_weighted)} suburbs with non-zero weights")
        
        return df_weighted
    
    def get_sample_suburbs(self, 
                          count: int,
                          remoteness_weights: Dict[str, float],
                          socioeconomic_weights: Dict[int, float],
                          random_seed: Optional[int] = None) -> List[Dict]:
        """
        Sample suburbs based on probability weights
        
        Args:
            count: Number of suburbs to sample
            remoteness_weights: Weights for remoteness levels
            socioeconomic_weights: Weights for socio-economic status
            random_seed: Optional random seed for reproducibility
            
        Returns:
            List of suburb dictionaries
        """
        if random_seed:
            np.random.seed(random_seed)
            
        weighted_df = self.get_weighted_suburbs(remoteness_weights, socioeconomic_weights)
        
        if len(weighted_df) == 0:
            logger.warning("No suburbs with non-zero weights found")
            return []
        
        # Sample based on weights
        sampled_suburbs = weighted_df.sample(
            n=min(count, len(weighted_df)), 
            weights='weight',
            replace=True,  # Allow replacement to get exact count
            random_state=random_seed
        )
        
        # Convert to list of dictionaries
        result = []
        for _, row in sampled_suburbs.iterrows():
            result.append({
                'suburb': row['Suburb'],
                'postcode': int(row['Postcode']),
                'council': row['Council'],
                'socio_status': int(row['SocioEconomicStatus']),
                'remoteness': row['Remoteness Level'],
                'weight': row['weight']
            })
        
        return result
    
    def get_distribution_summary(self, 
                                suburbs: List[Dict]) -> Dict[str, int]:
        """Get distribution summary of sampled suburbs"""
        remoteness_counts = {}
        socio_counts = {}
        
        for suburb in suburbs:
            remoteness = suburb['remoteness']
            socio = suburb['socio_status']
            
            remoteness_counts[remoteness] = remoteness_counts.get(remoteness, 0) + 1
            socio_counts[socio] = socio_counts.get(socio, 0) + 1
        
        return {
            'remoteness_distribution': remoteness_counts,
            'socioeconomic_distribution': socio_counts,
            'total_count': len(suburbs)
        }
    
    def get_unique_remoteness_levels(self) -> List[str]:
        """Get all unique remoteness levels in the data"""
        return self.processed_df['Remoteness Level'].unique().tolist()
    
    def get_unique_socio_levels(self) -> List[int]:
        """Get all unique socio-economic levels in the data"""
        return sorted(self.processed_df['SocioEconomicStatus'].unique().tolist())
    
    def get_unique_councils(self) -> List[str]:
        """Get all unique councils in the data"""
        return sorted(self.processed_df['Council'].unique().tolist())


