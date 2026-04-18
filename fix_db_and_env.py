import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
MANEX_PG_URL = os.getenv("MANEX_PG_URL")

engine = create_engine(MANEX_PG_URL)
with engine.connect() as conn:
    conn.execute(text("UPDATE defect SET image_url = REPLACE(image_url, '.jpg', '.png');"))
    conn.commit()

# Update .env
with open('.env', 'r') as f:
    env_content = f.read()

env_content = env_content.replace('MANEX_ASSETS_BASE_URL=http://34.89.205.150:9000', 'MANEX_ASSETS_BASE_URL=http://localhost:9000')

with open('.env', 'w') as f:
    f.write(env_content)
