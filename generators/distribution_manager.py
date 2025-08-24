"""
Distribution management implementation following Single Responsibility Principle
"""
import logging
from typing import Dict, Optional
from dataclasses import dataclass, field

from ..interfaces.address_generation import DistributionManager, AddressGenerationConfig

logger = logging.getLogger(__name__)


class SADistributionManager(DistributionManager):
    """South Australia specific distribution manager"""
    
    def __init__(self):
        """Initialize SA distribution manager with default weights"""
        self.default_remoteness_weights = {
            'Major Cities of Australia': 0.4,
            'Inner Regional Australia': 0.25,
            'Outer Regional Australia': 0.20,
            'Remote Australia': 0.10,
            'Very Remote Australia': 0.05,
            'Not Applicable': 0.0
        }
        
        self.default_socioeconomic_weights = {
            0: 0.05,  # Very low
            1: 0.10,  # Low
            2: 0.20,  # Below average
            3: 0.25,  # Average
            4: 0.25,  # Above average
            5: 0.15   # High
        }
        
        # Predefined distribution presets
        self.presets = self._create_presets()
    
    def get_default_distribution(self) -> AddressGenerationConfig:
        """Get default distribution parameters"""
        return AddressGenerationConfig(
            count=0,  # Will be set by caller
            remoteness_weights=self.default_remoteness_weights.copy(),
            socioeconomic_weights=self.default_socioeconomic_weights.copy()
        )
    
    def get_preset_distribution(self, preset_name: str) -> AddressGenerationConfig:
        """
        Get predefined distribution preset
        
        Args:
            preset_name: Name of preset to retrieve
            
        Returns:
            Distribution configuration
            
        Raises:
            ValueError: If preset_name is not found
        """
        if preset_name not in self.presets:
            available = list(self.presets.keys())
            raise ValueError(f"Unknown preset '{preset_name}'. Available presets: {available}")
        
        preset = self.presets[preset_name]
        
        return AddressGenerationConfig(
            count=0,  # Will be set by caller
            remoteness_weights=preset.get('remoteness_weights', self.default_remoteness_weights.copy()),
            socioeconomic_weights=preset.get('socioeconomic_weights', self.default_socioeconomic_weights.copy())
        )
    
    def validate_distribution(self, config: AddressGenerationConfig) -> bool:
        """
        Validate distribution configuration
        
        Args:
            config: Configuration to validate
            
        Returns:
            True if configuration is valid
        """
        try:
            # Validate count
            if config.count < 0:
                logger.error("Count must be non-negative")
                return False
            
            # Validate remoteness weights
            if config.remoteness_weights:
                if not self._validate_weight_dict(config.remoteness_weights, "remoteness"):
                    return False
            
            # Validate socioeconomic weights
            if config.socioeconomic_weights:
                if not self._validate_weight_dict(config.socioeconomic_weights, "socioeconomic"):
                    return False
            
            # Check if weights will produce any results
            if (config.remoteness_weights and 
                config.socioeconomic_weights and
                self._calculate_total_weight(config.remoteness_weights, config.socioeconomic_weights) == 0):
                logger.warning("Combined weights result in zero total weight - no addresses will be generated")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Distribution validation failed: {e}")
            return False
    
    def _validate_weight_dict(self, weights: Dict, weight_type: str) -> bool:
        """Validate a weight dictionary"""
        if not isinstance(weights, dict):
            logger.error(f"{weight_type} weights must be a dictionary")
            return False
        
        if not weights:
            logger.error(f"{weight_type} weights dictionary is empty")
            return False
        
        # Check for negative weights
        negative_weights = [k for k, v in weights.items() if v < 0]
        if negative_weights:
            logger.error(f"Negative weights not allowed in {weight_type}: {negative_weights}")
            return False
        
        # Check that at least one weight is positive
        positive_weights = [k for k, v in weights.items() if v > 0]
        if not positive_weights:
            logger.error(f"At least one {weight_type} weight must be positive")
            return False
        
        return True
    
    def _calculate_total_weight(self, 
                               remoteness_weights: Dict[str, float],
                               socioeconomic_weights: Dict[int, float]) -> float:
        """Calculate total combined weight"""
        total = 0.0
        for r_weight in remoteness_weights.values():
            for s_weight in socioeconomic_weights.values():
                total += r_weight * s_weight
        return total
    
    def _create_presets(self) -> Dict[str, Dict]:
        """Create predefined distribution presets"""
        return {
            'city_focused': {
                'description': 'Focus on Adelaide and major cities',
                'remoteness_weights': {
                    'Major Cities of Australia': 0.7,
                    'Inner Regional Australia': 0.2,
                    'Outer Regional Australia': 0.08,
                    'Remote Australia': 0.02,
                    'Very Remote Australia': 0.0,
                    'Not Applicable': 0.0
                }
            },
            
            'regional_focused': {
                'description': 'Focus on regional towns and cities',
                'remoteness_weights': {
                    'Major Cities of Australia': 0.2,
                    'Inner Regional Australia': 0.3,
                    'Outer Regional Australia': 0.4,
                    'Remote Australia': 0.1,
                    'Very Remote Australia': 0.0,
                    'Not Applicable': 0.0
                }
            },
            
            'remote_focused': {
                'description': 'Include more remote and very remote areas',
                'remoteness_weights': {
                    'Major Cities of Australia': 0.1,
                    'Inner Regional Australia': 0.2,
                    'Outer Regional Australia': 0.3,
                    'Remote Australia': 0.3,
                    'Very Remote Australia': 0.1,
                    'Not Applicable': 0.0
                }
            },
            
            'high_socio': {
                'description': 'Focus on higher socio-economic areas',
                'socioeconomic_weights': {
                    0: 0.02,  # Very low
                    1: 0.05,  # Low
                    2: 0.13,  # Below average
                    3: 0.20,  # Average
                    4: 0.30,  # Above average
                    5: 0.30   # High
                }
            },
            
            'low_socio': {
                'description': 'Focus on lower socio-economic areas',
                'socioeconomic_weights': {
                    0: 0.20,  # Very low
                    1: 0.30,  # Low
                    2: 0.25,  # Below average
                    3: 0.15,  # Average
                    4: 0.08,  # Above average
                    5: 0.02   # High
                }
            },
            
            'balanced': {
                'description': 'Balanced distribution across all categories',
                'remoteness_weights': self.default_remoteness_weights.copy(),
                'socioeconomic_weights': self.default_socioeconomic_weights.copy()
            },
            
            'urban_high_socio': {
                'description': 'Urban areas with higher socio-economic status',
                'remoteness_weights': {
                    'Major Cities of Australia': 0.8,
                    'Inner Regional Australia': 0.15,
                    'Outer Regional Australia': 0.05,
                    'Remote Australia': 0.0,
                    'Very Remote Australia': 0.0,
                    'Not Applicable': 0.0
                },
                'socioeconomic_weights': {
                    0: 0.02,
                    1: 0.05,
                    2: 0.13,
                    3: 0.25,
                    4: 0.30,
                    5: 0.25
                }
            },
            
            'rural_mixed': {
                'description': 'Rural and remote areas with mixed socio-economic status',
                'remoteness_weights': {
                    'Major Cities of Australia': 0.1,
                    'Inner Regional Australia': 0.3,
                    'Outer Regional Australia': 0.35,
                    'Remote Australia': 0.2,
                    'Very Remote Australia': 0.05,
                    'Not Applicable': 0.0
                },
                'socioeconomic_weights': self.default_socioeconomic_weights.copy()
            }
        }
    
    def get_available_presets(self) -> Dict[str, str]:
        """
        Get available presets with descriptions
        
        Returns:
            Dictionary mapping preset names to descriptions
        """
        return {name: preset.get('description', 'No description available') 
                for name, preset in self.presets.items()}
    
    def create_custom_preset(self, 
                           name: str,
                           description: str,
                           remoteness_weights: Optional[Dict[str, float]] = None,
                           socioeconomic_weights: Optional[Dict[int, float]] = None) -> None:
        """
        Create a custom distribution preset
        
        Args:
            name: Name for the new preset
            description: Description of the preset
            remoteness_weights: Optional custom remoteness weights
            socioeconomic_weights: Optional custom socioeconomic weights
        """
        if name in self.presets:
            logger.warning(f"Preset '{name}' already exists and will be overwritten")
        
        preset = {'description': description}
        
        if remoteness_weights:
            if not self._validate_weight_dict(remoteness_weights, "remoteness"):
                raise ValueError("Invalid remoteness weights")
            preset['remoteness_weights'] = remoteness_weights.copy()
        
        if socioeconomic_weights:
            if not self._validate_weight_dict(socioeconomic_weights, "socioeconomic"):
                raise ValueError("Invalid socioeconomic weights")
            preset['socioeconomic_weights'] = socioeconomic_weights.copy()
        
        self.presets[name] = preset
        logger.info(f"Created custom preset '{name}': {description}")
    
    def remove_preset(self, name: str) -> bool:
        """
        Remove a custom preset
        
        Args:
            name: Name of preset to remove
            
        Returns:
            True if preset was removed, False if not found
        """
        if name in self.presets:
            del self.presets[name]
            logger.info(f"Removed preset '{name}'")
            return True
        else:
            logger.warning(f"Preset '{name}' not found")
            return False
    
    def normalize_weights(self, weights: Dict) -> Dict:
        """
        Normalize weights so they sum to 1.0
        
        Args:
            weights: Weight dictionary to normalize
            
        Returns:
            Normalized weight dictionary
        """
        total = sum(weights.values())
        if total == 0:
            raise ValueError("Cannot normalize weights that sum to zero")
        
        return {k: v / total for k, v in weights.items()}
