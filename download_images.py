import os
import requests
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

MANEX_PG_URL = os.getenv("MANEX_PG_URL")
MANEX_ASSETS_BASE_URL = os.getenv("MANEX_ASSETS_BASE_URL", "").rstrip("/")

if not MANEX_PG_URL or not MANEX_ASSETS_BASE_URL:
    print("Missing PG URL or Assets Base URL")
    exit(1)

engine = create_engine(MANEX_PG_URL)

query = "SELECT DISTINCT image_url FROM defect WHERE image_url IS NOT NULL;"
with engine.connect() as conn:
    df = pd.read_sql(query, conn)

os.makedirs("defect_images", exist_ok=True)

for url_path in df["image_url"]:
    full_url = MANEX_ASSETS_BASE_URL + url_path
    filename = os.path.basename(url_path)
    local_path = os.path.join("defect_images", filename)
    
    if not os.path.exists(local_path):
        print(f"Downloading {full_url} to {local_path}...")
        try:
            response = requests.get(full_url, timeout=10)
            if response.status_code == 200:
                with open(local_path, "wb") as f:
                    f.write(response.content)
            else:
                print(f"Failed to download {full_url}: status {response.status_code}")
        except Exception as e:
            print(f"Error downloading {full_url}: {e}")
    else:
        print(f"{local_path} already exists")

print("Done downloading images.")
