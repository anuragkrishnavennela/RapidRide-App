import pika
import json
import os
from typing import Dict, Any
from app.core.logging import get_logger

logger = get_logger(__name__)


def publish_event(queue: str, payload: Dict[str, Any], rabbitmq_url: str = None) -> bool:
    """
    Publish an event message to RabbitMQ queue.
    
    Args:
        queue: Queue name
        payload: Message payload (will be JSON-serialized)
        rabbitmq_url: RabbitMQ connection URL (defaults to env variable)
    
    Returns:
        True if message published successfully, False otherwise
    """
    try:
        url = rabbitmq_url or os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
        params = pika.URLParameters(url)
        
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        
        # Declare queue (idempotent operation)
        channel.queue_declare(queue=queue, durable=True)
        
        # Publish message
        channel.basic_publish(
            exchange='',
            routing_key=queue,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Make message persistent
                content_type='application/json'
            )
        )
        
        logger.info(f"Published message to queue '{queue}': {payload}")
        connection.close()
        return True
        
    except Exception as e:
        logger.error(f"Failed to publish message to queue '{queue}': {str(e)}")
        return False


def create_consumer(queue: str, callback, rabbitmq_url: str = None):
    """
    Create a RabbitMQ consumer for a specific queue.
    
    Args:
        queue: Queue name to consume from
        callback: Callback function (ch, method, properties, body)
        rabbitmq_url: RabbitMQ connection URL (defaults to env variable)
    """
    try:
        url = rabbitmq_url or os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
        params = pika.URLParameters(url)
        
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        
        # Declare queue
        channel.queue_declare(queue=queue, durable=True)
        
        # Set up consumer
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(queue=queue, on_message_callback=callback)
        
        logger.info(f"Starting consumer for queue '{queue}'")
        channel.start_consuming()
        
    except Exception as e:
        logger.error(f"Failed to start consumer for queue '{queue}': {str(e)}")
        raise


def check_rabbitmq_connection(rabbitmq_url: str = None) -> bool:
    """
    Check if RabbitMQ connection is available.
    
    Args:
        rabbitmq_url: RabbitMQ connection URL (defaults to env variable)
    
    Returns:
        True if connection successful, False otherwise
    """
    try:
        url = rabbitmq_url or os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
        params = pika.URLParameters(url)
        
        connection = pika.BlockingConnection(params)
        connection.close()
        return True
        
    except Exception as e:
        logger.error(f"RabbitMQ connection failed: {str(e)}")
        return False
