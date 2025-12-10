import logging
import sys
from app.core.config import settings


def setup_logging():
    """Configure application logging"""
    
    # Create logger
    logger = logging.getLogger("rapidride")
    logger.setLevel(getattr(logging, settings.log_level.upper()))
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.log_level.upper()))
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(console_handler)
    
    return logger


# Global logger instance
logger = setup_logging()


def get_logger(name: str = "rapidride"):
    """Get logger instance"""
    return logging.getLogger(name)
