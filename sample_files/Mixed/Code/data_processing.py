import os
from pathlib import Path

def process_records(data):
    return [d.strip() for d in data if d]

if __name__ == '__main__':
    print('Data processing utility ready.')
