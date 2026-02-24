import signal
import sys
from app.workers.process_resume_worker import start_worker
from app.core.config import settings

running = True


def shutdown_handler(signum, frame):
    global running
    running = False
    sys.exit(0)


def main():
    
    # Register shutdown signals
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    
    start_worker()


if __name__ == "__main__":
    main()