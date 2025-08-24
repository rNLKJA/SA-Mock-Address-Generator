"""
Suburb sampling implementation following Single Responsibility Principle
"""
import pandas as pd
import numpy as np
import logging
from typing import List, Dict, Any, Optional
from ..interfaces.data_processing import SuburbSampler, WeightCalculator

logger = logging.getLogger(__name__)


class WeightCalculatorImpl(WeightCalculator):
    """Implementation of weight calculation for suburb sampling"""
    
    def calculate_weights(self, 
                         data: pd.DataFrame,
                         remoteness_weights: Dict[str, float],
                         socioeconomic_weights: Dict[int, float]) -> pd.DataFrame:
        """
        Calculate combined weights for suburb sampling
        
        Args:
            data: DataFrame with suburb data
            remoteness_weights: Weights for remoteness levels
            socioeconomic_weights: Weights for socio-economic status
            
        Returns:
            DataFrame with additional 'weight' column
        """
        if data is None or data.empty:
            logger.warning("No data provided for weight calculation")
            return data
        
        required_columns = ['Remoteness Level', 'SocioEconomicStatus']
        missing_columns = [col for col in required_columns if col not in data.columns]
        
        if missing_columns:
            raise ValueError(f"Missing required columns for weight calculation: {missing_columns}")
        
        logger.info(f"Calculating weights for {len(data)} suburbs")
        
        # Create weighted dataframe
        weighted_df = data.copy()
        
        # Map remoteness weights
        weighted_df['remoteness_weight'] = weighted_df['Remoteness Level'].map(remoteness_weights)
        
        # Map socioeconomic weights
        weighted_df['socioeconomic_weight'] = weighted_df['SocioEconomicStatus'].map(socioeconomic_weights)
        
        # Handle missing weights (assign 0)
        weighted_df['remoteness_weight'] = weighted_df['remoteness_weight'].fillna(0.0)
        weighted_df['socioeconomic_weight'] = weighted_df['socioeconomic_weight'].fillna(0.0)
        
        # Calculate combined weight (multiply both weights)
        weighted_df['weight'] = weighted_df['remoteness_weight'] * weighted_df['socioeconomic_weight']
        
        # Remove intermediate weight columns
        weighted_df = weighted_df.drop(['remoteness_weight', 'socioeconomic_weight'], axis=1)
        
        # Log weight distribution
        zero_weight_count = (weighted_df['weight'] == 0).sum()
        positive_weight_count = (weighted_df['weight'] > 0).sum()
        
        logger.info(f"Weight calculation completed: {positive_weight_count} suburbs with positive weights, "
                   f"{zero_weight_count} with zero weights")
        
        if positive_weight_count == 0:
            logger.warning("No suburbs have positive weights - all sampling will fail")
        
        return weighted_df


class SuburbSamplerImpl(SuburbSampler):
    """Implementation of suburb sampling with proper weight handling"""
    
    def __init__(self):
        """Initialize suburb sampler"""
        self.sampling_stats = {
            'total_samples_requested': 0,
            'successful_samples': 0,
            'failed_samples': 0,
            'replacements_used': 0
        }
    
    def sample_suburbs(self,
                      data: pd.DataFrame,
                      count: int,
                      weights_column: str = 'weight',
                      random_seed: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Sample suburbs based on weights
        
        Args:
            data: DataFrame with suburb data and weights
            count: Number of suburbs to sample
            weights_column: Name of column containing weights
            random_seed: Random seed for reproducibility
            
        Returns:
            List of sampled suburb dictionaries
        """
        if data is None or data.empty:
            logger.error("No data provided for sampling")
            return []
        
        if count <= 0:
            logger.warning("Sample count must be positive")
            return []
        
        if weights_column not in data.columns:
            raise ValueError(f"Weights column '{weights_column}' not found in data")
        
        # Set random seed if provided
        if random_seed is not None:
            np.random.seed(random_seed)
        
        # Filter to suburbs with positive weights
        valid_suburbs = data[data[weights_column] > 0].copy()
        
        if len(valid_suburbs) == 0:
            logger.error("No suburbs with positive weights available for sampling")
            self.sampling_stats['failed_samples'] += count
            return []
        
        logger.info(f"Sampling {count} suburbs from {len(valid_suburbs)} weighted suburbs")
        
        self.sampling_stats['total_samples_requested'] += count
        
        try:
            # Sample with replacement to get exact count
            if len(valid_suburbs) < count:
                logger.info(f"Using replacement sampling: {len(valid_suburbs)} unique suburbs for {count} samples")
                self.sampling_stats['replacements_used'] += count - len(valid_suburbs)
            
            sampled_df = valid_suburbs.sample(
                n=count,
                weights=weights_column,
                replace=True,  # Allow replacement to get exact count
                random_state=random_seed
            )
            
            # Convert to list of dictionaries
            result = []
            for _, row in sampled_df.iterrows():
                suburb_dict = {
                    'suburb': row['Suburb'],
                    'postcode': int(row['Postcode']),
                    'council': row['Council'],
                    'socio_status': int(row['SocioEconomicStatus']),
                    'remoteness': row['Remoteness Level'],
                    'weight': float(row[weights_column])
                }
                result.append(suburb_dict)
            
            self.sampling_stats['successful_samples'] += len(result)
            
            logger.info(f"Successfully sampled {len(result)} suburbs")
            return result
            
        except Exception as e:
            logger.error(f"Sampling failed: {e}")
            self.sampling_stats['failed_samples'] += count
            return []
    
    def get_sampling_stats(self) -> Dict[str, Any]:
        """Get statistics about sampling operations"""
        stats = self.sampling_stats.copy()
        
        if stats['total_samples_requested'] > 0:
            stats['success_rate'] = (stats['successful_samples'] / stats['total_samples_requested']) * 100
            stats['replacement_rate'] = (stats['replacements_used'] / stats['total_samples_requested']) * 100
        else:
            stats['success_rate'] = 0.0
            stats['replacement_rate'] = 0.0
        
        return stats
    
    def reset_stats(self) -> None:
        """Reset sampling statistics"""
        self.sampling_stats = {
            'total_samples_requested': 0,
            'successful_samples': 0,
            'failed_samples': 0,
            'replacements_used': 0
        }
    
    def validate_sample_distribution(self, 
                                   sampled_suburbs: List[Dict[str, Any]],
                                   expected_remoteness_weights: Dict[str, float],
                                   expected_socioeconomic_weights: Dict[int, float],
                                   tolerance: float = 0.1) -> Dict[str, Any]:
        """
        Validate that sample distribution matches expected weights
        
        Args:
            sampled_suburbs: List of sampled suburbs
            expected_remoteness_weights: Expected remoteness distribution
            expected_socioeconomic_weights: Expected socioeconomic distribution
            tolerance: Acceptable deviation from expected distribution (0.1 = 10%)
            
        Returns:
            Dictionary with validation results
        """
        if not sampled_suburbs:
            return {'valid': False, 'error': 'No sampled suburbs to validate'}
        
        total_samples = len(sampled_suburbs)
        
        # Calculate actual distributions
        actual_remoteness = {}
        actual_socioeconomic = {}
        
        for suburb in sampled_suburbs:
            # Count remoteness levels
            remoteness = suburb['remoteness']
            actual_remoteness[remoteness] = actual_remoteness.get(remoteness, 0) + 1
            
            # Count socioeconomic levels
            socio = suburb['socio_status']
            actual_socioeconomic[socio] = actual_socioeconomic.get(socio, 0) + 1
        
        # Convert counts to proportions
        actual_remoteness_props = {k: v/total_samples for k, v in actual_remoteness.items()}
        actual_socioeconomic_props = {k: v/total_samples for k, v in actual_socioeconomic.items()}
        
        # Normalize expected weights to proportions
        total_remoteness_weight = sum(expected_remoteness_weights.values())
        expected_remoteness_props = {k: v/total_remoteness_weight for k, v in expected_remoteness_weights.items()}
        
        total_socioeconomic_weight = sum(expected_socioeconomic_weights.values())
        expected_socioeconomic_props = {k: v/total_socioeconomic_weight for k, v in expected_socioeconomic_weights.items()}
        
        # Check deviations
        remoteness_deviations = {}
        for level in expected_remoteness_props:
            expected = expected_remoteness_props[level]
            actual = actual_remoteness_props.get(level, 0)
            deviation = abs(actual - expected)
            remoteness_deviations[level] = {
                'expected': expected,
                'actual': actual,
                'deviation': deviation,
                'within_tolerance': deviation <= tolerance
            }
        
        socioeconomic_deviations = {}
        for level in expected_socioeconomic_props:
            expected = expected_socioeconomic_props[level]
            actual = actual_socioeconomic_props.get(level, 0)
            deviation = abs(actual - expected)
            socioeconomic_deviations[level] = {
                'expected': expected,
                'actual': actual,
                'deviation': deviation,
                'within_tolerance': deviation <= tolerance
            }
        
        # Overall validation
        all_remoteness_valid = all(d['within_tolerance'] for d in remoteness_deviations.values())
        all_socioeconomic_valid = all(d['within_tolerance'] for d in socioeconomic_deviations.values())
        
        return {
            'valid': all_remoteness_valid and all_socioeconomic_valid,
            'total_samples': total_samples,
            'tolerance': tolerance,
            'remoteness_validation': remoteness_deviations,
            'socioeconomic_validation': socioeconomic_deviations,
            'summary': {
                'remoteness_valid': all_remoteness_valid,
                'socioeconomic_valid': all_socioeconomic_valid
            }
        }
