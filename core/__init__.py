"""
Core package containing dependency injection and configuration management
"""

from .dependency_container import (
    DependencyContainer,
    get_default_container,
    configure_default_container,
    reset_default_container
)

__all__ = [
    "DependencyContainer",
    "get_default_container",
    "configure_default_container", 
    "reset_default_container"
]
