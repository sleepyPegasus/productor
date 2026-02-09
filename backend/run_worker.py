#!/usr/bin/env python3
"""Celery worker startup script.

Usage:
    # Start default worker (handles all queues)
    python run_worker.py
    
    # Start generation-specific worker
    python run_worker.py --queue generation --concurrency 2
    
    # Start with log level debug
    python run_worker.py --loglevel debug
"""

import argparse
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.celery_app import celery_app


def main():
    parser = argparse.ArgumentParser(description="Start Celery worker")
    parser.add_argument(
        "--queue",
        default="default,generation",
        help="Comma-separated list of queues to consume (default: default,generation)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="Number of concurrent worker processes (default: 2)",
    )
    parser.add_argument(
        "--loglevel",
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
        help="Logging level (default: info)",
    )
    parser.add_argument(
        "--beat",
        action="store_true",
        help="Also run the Celery beat scheduler",
    )
    
    args = parser.parse_args()
    
    # Build Celery command
    argv = [
        "worker",
        "--queues", args.queue,
        "--concurrency", str(args.concurrency),
        "--loglevel", args.loglevel,
        "--hostname", "productor-worker@%h",
    ]
    
    if args.beat:
        argv.append("--beat")
    
    print(f"Starting Celery worker with queues: {args.queue}")
    print(f"Concurrency: {args.concurrency}")
    print(f"Log level: {args.loglevel}")
    
    # Start worker
    celery_app.worker_main(argv)


if __name__ == "__main__":
    main()
